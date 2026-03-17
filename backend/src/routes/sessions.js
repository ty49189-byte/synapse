const express = require("express");
const router = express.Router();
const { Room } = require("../models");

// GET /api/session
router.get("/", async (req, res, next) => {
  try {
    const userId = req.userId;

    const rooms = await Room.find({
      $or: [{ host: userId }, { "participants.user": userId }],
    });

    const sessions = rooms.map((room) => ({
      _id: room._id,
      name: room.name,
      isLive: room.status === "active",
      students: room.participants?.length || 0,
      maxStudents: room.maxParticipants || 50,
      startTime: room.scheduledAt || "TBD",
    }));

    res.json({
      success: true,
      data: { sessions },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;