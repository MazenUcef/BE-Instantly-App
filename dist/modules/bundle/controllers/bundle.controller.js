"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBundle = exports.toggleBundleStatus = exports.updateBundle = exports.getMyBundles = exports.getBundleById = exports.getAllBundles = exports.createBundle = void 0;
const bundle_service_1 = require("../services/bundle.service");
const createBundle = async (req, res) => {
    const result = await bundle_service_1.BundleService.createBundle({
        supplierId: req.user.userId,
        categoryId: req.body.categoryId,
        governmentIds: req.body.governmentIds,
        title: req.body.title,
        subtitle: req.body.subtitle,
        description: req.body.description,
        image: req.body.image,
        price: Number(req.body.price),
        oldPrice: req.body.oldPrice !== undefined ? Number(req.body.oldPrice) : null,
        durationMinutes: Number(req.body.durationMinutes),
        includes: req.body.includes,
        tags: req.body.tags,
    });
    return res.status(201).json(result);
};
exports.createBundle = createBundle;
const getAllBundles = async (req, res) => {
    const result = await bundle_service_1.BundleService.getAllBundles({
        categoryId: req.query.categoryId,
        governmentId: req.query.governmentId,
        supplierId: req.query.supplierId,
    });
    return res.status(200).json(result);
};
exports.getAllBundles = getAllBundles;
const getBundleById = async (req, res) => {
    const result = await bundle_service_1.BundleService.getBundleById({
        bundleId: req.params.id,
    });
    return res.status(200).json(result);
};
exports.getBundleById = getBundleById;
const getMyBundles = async (req, res) => {
    const result = await bundle_service_1.BundleService.getMyBundles({
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getMyBundles = getMyBundles;
const updateBundle = async (req, res) => {
    const result = await bundle_service_1.BundleService.updateBundle({
        supplierId: req.user.userId,
        bundleId: req.params.id,
        updates: req.body,
    });
    return res.status(200).json(result);
};
exports.updateBundle = updateBundle;
const toggleBundleStatus = async (req, res) => {
    const result = await bundle_service_1.BundleService.toggleBundleStatus({
        supplierId: req.user.userId,
        bundleId: req.params.id,
    });
    return res.status(200).json(result);
};
exports.toggleBundleStatus = toggleBundleStatus;
const deleteBundle = async (req, res) => {
    const result = await bundle_service_1.BundleService.deleteBundle({
        supplierId: req.user.userId,
        bundleId: req.params.id,
    });
    return res.status(200).json(result);
};
exports.deleteBundle = deleteBundle;
