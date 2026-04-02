"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplierAvailableSlots = exports.removeBlockedDate = exports.blockDate = exports.upsertMyAvailability = exports.getMyAvailability = void 0;
const availability_service_1 = require("../services/availability.service");
const getMyAvailability = async (req, res) => {
    const result = await availability_service_1.AvailabilityService.getMyAvailability({
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getMyAvailability = getMyAvailability;
const upsertMyAvailability = async (req, res) => {
    const result = await availability_service_1.AvailabilityService.upsertMyAvailability({
        supplierId: req.user.userId,
        timezone: req.body.timezone,
        weeklySchedule: req.body.weeklySchedule,
    });
    return res.status(200).json(result);
};
exports.upsertMyAvailability = upsertMyAvailability;
const blockDate = async (req, res) => {
    const result = await availability_service_1.AvailabilityService.blockDate({
        supplierId: req.user.userId,
        date: req.body.date,
        reason: req.body.reason,
        isFullDay: req.body.isFullDay,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
    });
    return res.status(201).json(result);
};
exports.blockDate = blockDate;
const removeBlockedDate = async (req, res) => {
    const result = await availability_service_1.AvailabilityService.removeBlockedDate({
        supplierId: req.user.userId,
        blockedDateId: req.params.blockedDateId,
    });
    return res.status(200).json(result);
};
exports.removeBlockedDate = removeBlockedDate;
const getSupplierAvailableSlots = async (req, res) => {
    const result = await availability_service_1.AvailabilityService.getSupplierAvailableSlots({
        supplierId: req.params.supplierId,
        date: req.query.date,
    });
    return res.status(200).json(result);
};
exports.getSupplierAvailableSlots = getSupplierAvailableSlots;
