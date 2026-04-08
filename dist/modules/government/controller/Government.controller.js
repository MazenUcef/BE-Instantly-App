"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleGovernmentStatus = exports.deleteGovernment = exports.updateGovernment = exports.getGovernmentById = exports.getAllGovernmentsAdmin = exports.getAllGovernments = exports.createGovernment = void 0;
const government_service_1 = require("../service/government.service");
const createGovernment = async (req, res) => {
    const result = await government_service_1.GovernmentService.createGovernment({
        name: req.body.name,
        nameAr: req.body.nameAr,
        country: req.body.country,
        order: req.body.order,
    });
    return res.status(201).json(result);
};
exports.createGovernment = createGovernment;
const getAllGovernments = async (_req, res) => {
    const result = await government_service_1.GovernmentService.getAllGovernments();
    return res.status(200).json(result);
};
exports.getAllGovernments = getAllGovernments;
const getAllGovernmentsAdmin = async (_req, res) => {
    const result = await government_service_1.GovernmentService.getAllGovernmentsAdmin();
    return res.status(200).json(result);
};
exports.getAllGovernmentsAdmin = getAllGovernmentsAdmin;
const getGovernmentById = async (req, res) => {
    const result = await government_service_1.GovernmentService.getGovernmentById(req.params.id);
    return res.status(200).json(result);
};
exports.getGovernmentById = getGovernmentById;
const updateGovernment = async (req, res) => {
    const result = await government_service_1.GovernmentService.updateGovernment(req.params.id, {
        name: req.body.name,
        nameAr: req.body.nameAr,
        country: req.body.country,
        order: req.body.order,
        isActive: req.body.isActive,
    });
    return res.status(200).json(result);
};
exports.updateGovernment = updateGovernment;
const deleteGovernment = async (req, res) => {
    const result = await government_service_1.GovernmentService.deleteGovernment(req.params.id);
    return res.status(200).json(result);
};
exports.deleteGovernment = deleteGovernment;
const toggleGovernmentStatus = async (req, res) => {
    const result = await government_service_1.GovernmentService.toggleGovernmentStatus(req.params.id);
    return res.status(200).json(result);
};
exports.toggleGovernmentStatus = toggleGovernmentStatus;
