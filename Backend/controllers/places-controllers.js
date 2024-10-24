const fs = require("fs");
const uuid = require("uuid");
const { validationResult } = require("express-validator");
const mongoose = require("mongoose");
const HttpError = require("../models/http-error");
const Place = require("../models/place");
const User = require("../models/user");

const getPlacesById = async (req, res, next) => {
  const placeId = req.params.pid;
  let place;
  try {
    place = await Place.findById(placeId).exec();
  } catch (err) {
    const error = new HttpError("Couldn't find place with Id", 500);
    return next(error);
  }
  if (!place || place.length === 0) {
    const error = new HttpError(
      "Could not find the place for the provided Id",
      404
    );
    return next(error);
  }
  res.json({ place: place.toObject({ getters: true }) });
};

const getUserById = async (req, res, next) => {
  const userId = req.params.uid; // Ensure 'uid' matches the URL parameter in your route
  let userPlaces;

  try {
    userPlaces = await Place.find({ creator: userId }).exec();
  } catch (err) {
    console.error(err); // Log the error for debugging
    const error = new HttpError(
      "Fetching places failed, please try again later.",
      500
    );
    return next(error);
  }

  // If no places are found, send an empty array instead of throwing an error
  if (!userPlaces || userPlaces.length === 0) {
    return res.status(200).json({
      message: "No places found for the provided User Id.",
      places: [], // Send empty array but with a 200 status
    });
  }

  res.json({
    places: userPlaces.map((place) => place.toObject({ getters: true })),
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError("Invalid Inputs, Please check again", 422);
  }

  const { title, description, address, coordinates } = req.body;

  // Log incoming data
  // console.log("Received Data:", {
  //   title,
  //   description,
  //   address,
  //   creator,
  //   coordinates,
  // });

  let parsedCoordinates;
  try {
    parsedCoordinates = JSON.parse(coordinates);
    //console.log("Parsed Coordinates:", parsedCoordinates);
  } catch (err) {
    console.error("Error parsing coordinates:", err);
    return next(new HttpError("Invalid coordinates format.", 422));
  }

  if (
    !parsedCoordinates ||
    typeof parsedCoordinates.lat !== "number" ||
    typeof parsedCoordinates.lng !== "number"
  ) {
    return next(new HttpError("Invalid coordinates data.", 422));
  }

  const createdPlace = new Place({
    title,
    description,
    address,
    image: req.file.path,
    location: {
      lat: parsedCoordinates.lat,
      lng: parsedCoordinates.lng,
    },
    creator: req.userData.userId,
  });

  let user;
  try {
    user = await User.findById(req.userData.userId);
  } catch (err) {
    const error = new HttpError(
      "Creating place failed, please try again later",
      500
    );
    return next(error);
  }

  if (!user) {
    const error = new HttpError("Could not find user for provided ID.", 404);
    return next(error);
  }

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save({ session: sess });
    await sess.commitTransaction();
    sess.endSession();
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      "Couldn't create a Place, please try again",
      500
    );
    return next(error);
  }

  res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError("Invalid Inputs, Please check again", 422);
  }
  const { title, description } = req.body;
  const placeId = req.params.pid;
  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update the place",
      500
    );
    return next(error);
  }

  if (place.creator.toString() !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }

  place.title = title;
  place.description = description;

  await place.save();

  res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;

  let place;
  try {
    // Using findByIdAndDelete directly
    place = await Place.findByIdAndDelete(placeId).populate("creator");

    if (!place) {
      const error = new HttpError("Could not find a place for this id", 404);
      return next(error);
    }
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, couldn't delete the place",
      500
    );
    return next(error);
  }

  if (place.creator.id !== req.userData.userId) {
    const error = new HttpError(
      "You are not allowed to delete this place.",
      401
    );
    return next(error);
  }
  const imagePath = place.image;
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();

    place.creator.places.pull(place._id); // Remove the place reference from the creator
    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, couldn't update creator after place deletion",
      500
    );
    return next(error);
  }

  fs.unlink(imagePath, (err) => {
    console.log(err);
  });

  res.status(200).json({ message: "Deleted Place." });
};

exports.getPlacesById = getPlacesById;
exports.getUserById = getUserById;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
