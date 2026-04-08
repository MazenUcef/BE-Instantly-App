"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupplierPendingOffers = exports.getAcceptedOfferHistory = exports.acceptOrderDirect = exports.getOffersByOrder = exports.deleteOffer = exports.rejectOffer = exports.acceptOffer = exports.createOffer = void 0;
const offer_service_1 = require("../service/offer.service");
const createOffer = async (req, res) => {
    const result = await offer_service_1.OfferService.createOffer({
        supplierId: req.user.userId,
        orderId: req.body.orderId,
        amount: Number(req.body.amount),
        timeRange: req.body.timeRange,
        timeToStart: req.body.timeToStart,
    });
    return res.status(result.created ? 201 : 200).json(result);
};
exports.createOffer = createOffer;
const acceptOffer = async (req, res) => {
    const result = await offer_service_1.OfferService.acceptOffer({
        offerId: req.params.id,
        customerId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.acceptOffer = acceptOffer;
const rejectOffer = async (req, res) => {
    const result = await offer_service_1.OfferService.rejectOffer({
        offerId: req.params.id,
        customerId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.rejectOffer = rejectOffer;
const deleteOffer = async (req, res) => {
    const result = await offer_service_1.OfferService.deleteOffer({
        offerId: req.params.id,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.deleteOffer = deleteOffer;
const getOffersByOrder = async (req, res) => {
    const result = await offer_service_1.OfferService.getOffersByOrder({
        orderId: req.params.orderId,
        userId: req.user.userId,
        role: req.user.role,
    });
    return res.status(200).json(result);
};
exports.getOffersByOrder = getOffersByOrder;
const acceptOrderDirect = async (req, res) => {
    const result = await offer_service_1.OfferService.acceptOrderDirect({
        orderId: req.params.orderId,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.acceptOrderDirect = acceptOrderDirect;
const getAcceptedOfferHistory = async (req, res) => {
    const result = await offer_service_1.OfferService.getAcceptedOfferHistory({
        supplierId: req.user.userId,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
    });
    return res.status(200).json(result);
};
exports.getAcceptedOfferHistory = getAcceptedOfferHistory;
const getSupplierPendingOffers = async (req, res) => {
    const result = await offer_service_1.OfferService.getSupplierPendingOffers({
        supplierId: req.user.userId,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
    });
    return res.status(200).json(result);
};
exports.getSupplierPendingOffers = getSupplierPendingOffers;
