import { ClientSession, Types } from "mongoose";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";
import offerModel from "../models/Offer.model";

export class OfferRepository {
  static createOffer(
    data: {
      orderId: Types.ObjectId | string;
      supplierId: Types.ObjectId | string;
      amount: number;
      estimatedDuration?: number | null;
      numberOfDays?: number | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
      status?: string;
    },
    session?: ClientSession,
  ) {
    return offerModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(offerId: Types.ObjectId | string, session?: ClientSession) {
    return offerModel.findById(offerId).session(session || null);
  }

  static findPendingOfferBySupplierAndOrder(
    supplierId: Types.ObjectId | string,
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return offerModel.findOne({
      supplierId,
      orderId,
      status: OFFER_STATUS.PENDING,
    }).session(session || null);
  }

  static findAcceptedOfferBySupplier(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return offerModel.findOne({
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
    return offerModel.find({
      supplierId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static countPendingOffersBySupplier(supplierId: Types.ObjectId | string) {
    return offerModel.countDocuments({
      supplierId,
      status: OFFER_STATUS.PENDING,
    });
  }

  static findPendingOffersByOrder(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return offerModel.find({
      orderId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findOrderOffers(orderId: Types.ObjectId | string) {
    return offerModel.find({
      orderId,
      status: { $in: [OFFER_STATUS.PENDING, OFFER_STATUS.ACCEPTED] },
    }).sort({ createdAt: -1 });
  }

  static findSupplierOfferForOrder(
    orderId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
  ) {
    return offerModel.find({
      orderId,
      supplierId,
      status: { $in: [OFFER_STATUS.PENDING, OFFER_STATUS.ACCEPTED] },
    }).sort({ createdAt: -1 });
  }

  static updatePendingOffer(
    offerId: Types.ObjectId | string,
    data: {
      amount: number;
      estimatedDuration?: number | null;
      numberOfDays?: number | null;
      timeToStart?: Date | string | null;
      expiresAt?: Date | null;
    },
    session?: ClientSession,
  ) {
    return offerModel.findOneAndUpdate(
      { _id: offerId, status: OFFER_STATUS.PENDING },
      {
        $set: {
          amount: data.amount,
          estimatedDuration: data.estimatedDuration ?? null,
          numberOfDays: data.numberOfDays ?? null,
          timeToStart: data.timeToStart ?? null,
          expiresAt: data.expiresAt ?? null,
        },
      },
      { new: true, session },
    );
  }

  static findSupplierScheduledWindows(
    supplierId: Types.ObjectId | string,
    excludeOfferId?: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    const filter: any = {
      supplierId,
      status: OFFER_STATUS.ACCEPTED,
      timeToStart: { $ne: null },
      estimatedDuration: { $ne: null },
    };
    if (excludeOfferId) {
      filter._id = { $ne: excludeOfferId };
    }
    return offerModel.find(filter).select("timeToStart estimatedDuration").session(session || null);
  }

  static acceptPendingOffer(
    offerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return offerModel.findOneAndUpdate(
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
    return offerModel.findOneAndUpdate(
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
    return offerModel.updateMany(
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
    return offerModel.updateMany(
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
    return offerModel.find({
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
    return offerModel.findOneAndUpdate(
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
    return offerModel.findOneAndUpdate(
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

  static markCompleted(
    offerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return offerModel.findOneAndUpdate(
      {
        _id: offerId,
        status: OFFER_STATUS.ACCEPTED,
      },
      {
        $set: {
          status: OFFER_STATUS.COMPLETED,
          completedAt: new Date(),
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

    return offerModel.find({
      supplierId,
      status: {
        $in: [OFFER_STATUS.ACCEPTED, OFFER_STATUS.COMPLETED, OFFER_STATUS.WITHDRAWN],
      },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  static countSupplierAcceptedOffersHistory(
    supplierId: Types.ObjectId | string,
  ) {
    return offerModel.countDocuments({
      supplierId,
      status: {
        $in: [OFFER_STATUS.ACCEPTED, OFFER_STATUS.COMPLETED, OFFER_STATUS.WITHDRAWN],
      },
    });
  }

  static findSupplierPendingOffersPaginated(
    supplierId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    return offerModel.find({
      supplierId,
      status: OFFER_STATUS.PENDING,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }
}