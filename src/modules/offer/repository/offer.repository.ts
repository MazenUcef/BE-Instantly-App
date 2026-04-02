import { ClientSession, Types } from "mongoose";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";
import OfferModel from "../models/Offer.model";

export class OfferRepository {
  static createOffer(
    data: {
      orderId: Types.ObjectId | string;
      supplierId: Types.ObjectId | string;
      amount: number;
      timeRange?: string | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
      status?: string;
    },
    session?: ClientSession,
  ) {
    return OfferModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(offerId: Types.ObjectId | string, session?: ClientSession) {
    return OfferModel.findById(offerId).session(session || null);
  }

  static findPendingOfferBySupplierAndOrder(
    supplierId: Types.ObjectId | string,
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOne({
      supplierId,
      orderId,
      status: OFFER_STATUS.PENDING,
    }).session(session || null);
  }

  static findAcceptedOfferBySupplier(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOne({
      supplierId,
      status: OFFER_STATUS.ACCEPTED,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findPendingOffersBySupplier(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.find({
      supplierId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static countPendingOffersBySupplier(supplierId: Types.ObjectId | string) {
    return OfferModel.countDocuments({
      supplierId,
      status: OFFER_STATUS.PENDING,
    });
  }

  static findPendingOffersByOrder(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.find({
      orderId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findOrderOffers(orderId: Types.ObjectId | string) {
    return OfferModel.find({
      orderId,
      status: { $in: [OFFER_STATUS.PENDING, OFFER_STATUS.ACCEPTED] },
    }).sort({ createdAt: -1 });
  }

  static updatePendingOffer(
    offerId: Types.ObjectId | string,
    data: {
      amount: number;
      timeRange?: string | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
    },
    session?: ClientSession,
  ) {
    return OfferModel.findOneAndUpdate(
      { _id: offerId, status: OFFER_STATUS.PENDING },
      {
        $set: {
          amount: data.amount,
          timeRange: data.timeRange ?? null,
          timeToStart: data.timeToStart ?? null,
          expiresAt: data.expiresAt ?? null,
        },
      },
      { new: true, session },
    );
  }

  static acceptPendingOffer(
    offerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOneAndUpdate(
      { _id: offerId, status: OFFER_STATUS.PENDING },
      {
        $set: {
          status: OFFER_STATUS.ACCEPTED,
          acceptedAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static rejectPendingOffer(
    offerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOneAndUpdate(
      { _id: offerId, status: OFFER_STATUS.PENDING },
      {
        $set: {
          status: OFFER_STATUS.REJECTED,
          rejectedAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static rejectOtherOffersForOrder(
    orderId: Types.ObjectId | string,
    acceptedOfferId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.updateMany(
      {
        orderId,
        _id: { $ne: acceptedOfferId },
        status: OFFER_STATUS.PENDING,
      },
      {
        $set: {
          status: OFFER_STATUS.REJECTED,
          rejectedAt: new Date(),
        },
      },
      { session },
    );
  }

  static rejectOtherPendingOffersForSupplier(
    supplierId: Types.ObjectId | string,
    acceptedOfferId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.updateMany(
      {
        supplierId,
        _id: { $ne: acceptedOfferId },
        status: OFFER_STATUS.PENDING,
      },
      {
        $set: {
          status: OFFER_STATUS.REJECTED,
          rejectedAt: new Date(),
        },
      },
      { session },
    );
  }

  static findSupplierOtherPendingOffers(
    supplierId: Types.ObjectId | string,
    excludeOfferId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.find({
      supplierId,
      status: OFFER_STATUS.PENDING,
      _id: { $ne: excludeOfferId },
    }).session(session || null);
  }

  static withdrawPendingOfferBySupplier(
    offerId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOneAndUpdate(
      {
        _id: offerId,
        supplierId,
        status: OFFER_STATUS.PENDING,
      },
      {
        $set: {
          status: OFFER_STATUS.WITHDRAWN,
          withdrawnAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static withdrawAcceptedOfferBySupplier(
    offerId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OfferModel.findOneAndUpdate(
      {
        _id: offerId,
        supplierId,
        status: OFFER_STATUS.ACCEPTED,
      },
      {
        $set: {
          status: OFFER_STATUS.WITHDRAWN,
          withdrawnAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static findSupplierAcceptedOffersHistory(
    supplierId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    return OfferModel.find({
      supplierId,
      status: OFFER_STATUS.ACCEPTED,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  static countSupplierAcceptedOffersHistory(
    supplierId: Types.ObjectId | string,
  ) {
    return OfferModel.countDocuments({
      supplierId,
      status: OFFER_STATUS.ACCEPTED,
    });
  }

  static findSupplierPendingOffersPaginated(
    supplierId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    return OfferModel.find({
      supplierId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }
}