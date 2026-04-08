"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferRepository = void 0;
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const Offer_model_1 = __importDefault(require("../models/Offer.model"));
class OfferRepository {
    static createOffer(data, session) {
        return Offer_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(offerId, session) {
        return Offer_model_1.default.findById(offerId).session(session || null);
    }
    static findPendingOfferBySupplierAndOrder(supplierId, orderId, session) {
        return Offer_model_1.default.findOne({
            supplierId,
            orderId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        }).session(session || null);
    }
    static findAcceptedOfferBySupplier(supplierId, session) {
        return Offer_model_1.default.findOne({
            supplierId,
            status: offer_constants_1.OFFER_STATUS.ACCEPTED,
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findPendingOffersBySupplier(supplierId, session) {
        return Offer_model_1.default.find({
            supplierId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static countPendingOffersBySupplier(supplierId) {
        return Offer_model_1.default.countDocuments({
            supplierId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        });
    }
    static findPendingOffersByOrder(orderId, session) {
        return Offer_model_1.default.find({
            orderId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findOrderOffers(orderId) {
        return Offer_model_1.default.find({
            orderId,
            status: { $in: [offer_constants_1.OFFER_STATUS.PENDING, offer_constants_1.OFFER_STATUS.ACCEPTED] },
        }).sort({ createdAt: -1 });
    }
    static updatePendingOffer(offerId, data, session) {
        return Offer_model_1.default.findOneAndUpdate({ _id: offerId, status: offer_constants_1.OFFER_STATUS.PENDING }, {
            $set: {
                amount: data.amount,
                timeRange: data.timeRange ?? null,
                timeToStart: data.timeToStart ?? null,
                expiresAt: data.expiresAt ?? null,
            },
        }, { new: true, session });
    }
    static acceptPendingOffer(offerId, session) {
        return Offer_model_1.default.findOneAndUpdate({ _id: offerId, status: offer_constants_1.OFFER_STATUS.PENDING }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.ACCEPTED,
                acceptedAt: new Date(),
            },
        }, { new: true, session });
    }
    static rejectPendingOffer(offerId, session) {
        return Offer_model_1.default.findOneAndUpdate({ _id: offerId, status: offer_constants_1.OFFER_STATUS.PENDING }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.REJECTED,
                rejectedAt: new Date(),
            },
        }, { new: true, session });
    }
    static rejectOtherOffersForOrder(orderId, acceptedOfferId, session) {
        return Offer_model_1.default.updateMany({
            orderId,
            _id: { $ne: acceptedOfferId },
            status: offer_constants_1.OFFER_STATUS.PENDING,
        }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.REJECTED,
                rejectedAt: new Date(),
            },
        }, { session });
    }
    static rejectOtherPendingOffersForSupplier(supplierId, acceptedOfferId, session) {
        return Offer_model_1.default.updateMany({
            supplierId,
            _id: { $ne: acceptedOfferId },
            status: offer_constants_1.OFFER_STATUS.PENDING,
        }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.REJECTED,
                rejectedAt: new Date(),
            },
        }, { session });
    }
    static findSupplierOtherPendingOffers(supplierId, excludeOfferId, session) {
        return Offer_model_1.default.find({
            supplierId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
            _id: { $ne: excludeOfferId },
        }).session(session || null);
    }
    static withdrawPendingOfferBySupplier(offerId, supplierId, session) {
        return Offer_model_1.default.findOneAndUpdate({
            _id: offerId,
            supplierId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.WITHDRAWN,
                withdrawnAt: new Date(),
            },
        }, { new: true, session });
    }
    static withdrawAcceptedOfferBySupplier(offerId, supplierId, session) {
        return Offer_model_1.default.findOneAndUpdate({
            _id: offerId,
            supplierId,
            status: offer_constants_1.OFFER_STATUS.ACCEPTED,
        }, {
            $set: {
                status: offer_constants_1.OFFER_STATUS.WITHDRAWN,
                withdrawnAt: new Date(),
            },
        }, { new: true, session });
    }
    static findSupplierAcceptedOffersHistory(supplierId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        return Offer_model_1.default.find({
            supplierId,
            status: {
                $in: [offer_constants_1.OFFER_STATUS.ACCEPTED, offer_constants_1.OFFER_STATUS.COMPLETED, offer_constants_1.OFFER_STATUS.WITHDRAWN],
            },
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
    }
    static countSupplierAcceptedOffersHistory(supplierId) {
        return Offer_model_1.default.countDocuments({
            supplierId,
            status: {
                $in: [offer_constants_1.OFFER_STATUS.ACCEPTED, offer_constants_1.OFFER_STATUS.COMPLETED, offer_constants_1.OFFER_STATUS.WITHDRAWN],
            },
        });
    }
    static findSupplierPendingOffersPaginated(supplierId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        return Offer_model_1.default.find({
            supplierId,
            status: offer_constants_1.OFFER_STATUS.PENDING,
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
    }
}
exports.OfferRepository = OfferRepository;
