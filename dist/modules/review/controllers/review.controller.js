"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserReviews = exports.getOrderReviews = exports.getReviewById = exports.createReview = void 0;
const review_service_1 = require("../services/review.service");
const createReview = async (req, res) => {
    const result = await review_service_1.ReviewService.createReview({
        actorUserId: req.user.userId,
        orderId: req.body.orderId,
        rating: req.body.rating,
        comment: req.body.comment,
        role: req.body.role,
    });
    return res.status(201).json(result);
};
exports.createReview = createReview;
const getReviewById = async (req, res) => {
    const result = await review_service_1.ReviewService.getReviewById(req.params.id);
    return res.status(200).json(result);
};
exports.getReviewById = getReviewById;
const getOrderReviews = async (req, res) => {
    const result = await review_service_1.ReviewService.getOrderReviews(req.params.orderId);
    return res.status(200).json(result);
};
exports.getOrderReviews = getOrderReviews;
const getUserReviews = async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const result = await review_service_1.ReviewService.getUserReviews(req.params.userId, page, limit);
    return res.status(200).json(result);
};
exports.getUserReviews = getUserReviews;
