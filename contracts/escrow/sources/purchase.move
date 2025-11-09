/// Purchase module for SourceNet data marketplace
/// Manages purchase requests and fulfillment
module sourcenet::purchase {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use std::string::String;

    /// PurchaseRequest represents a data purchase transaction
    public struct PurchaseRequest has key, store {
        id: UID,
        purchase_id: String,
        datapod_id: String,
        buyer: address,
        seller: address,
        buyer_public_key: String,
        price_sui: u64,
        data_hash: String,
        status: u8, // 0: pending, 1: completed, 2: refunded, 3: disputed
        created_at: u64,
        completed_at: u64,
    }

    /// PurchaseRequest owner capability
    public struct PurchaseOwnerCap has key {
        id: UID,
        purchase_id: address,
    }

    // Events
    public struct PurchaseCreated has copy, drop {
        purchase_id: address,
        datapod_id: String,
        buyer: address,
        seller: address,
        price_sui: u64,
    }

    public struct PurchaseCompleted has copy, drop {
        purchase_id: address,
        buyer: address,
        seller: address,
        price_sui: u64,
    }

    public struct PurchaseRefunded has copy, drop {
        purchase_id: address,
        buyer: address,
        price_sui: u64,
    }

    public struct PurchaseDisputed has copy, drop {
        purchase_id: address,
        buyer: address,
        seller: address,
    }

    // Errors
    const EInvalidStatus: u64 = 1;
    const EUnauthorized: u64 = 2;
    const EInvalidPrice: u64 = 3;

    /// Create new purchase request
    public fun create_purchase(
        purchase_id: String,
        datapod_id: String,
        buyer: address,
        seller: address,
        buyer_public_key: String,
        price_sui: u64,
        data_hash: String,
        ctx: &mut TxContext,
    ): (PurchaseRequest, PurchaseOwnerCap) {
        assert!(price_sui > 0, EInvalidPrice);

        let id = object::new(ctx);
        let purchase_addr = object::uid_to_address(&id);

        let purchase = PurchaseRequest {
            id: id,
            purchase_id: purchase_id,
            datapod_id: datapod_id,
            buyer: buyer,
            seller: seller,
            buyer_public_key: buyer_public_key,
            price_sui: price_sui,
            data_hash: data_hash,
            status: 0, // pending
            created_at: tx_context::epoch(ctx),
            completed_at: 0,
        };

        let cap = PurchaseOwnerCap {
            id: object::new(ctx),
            purchase_id: purchase_addr,
        };

        event::emit(PurchaseCreated {
            purchase_id: purchase_addr,
            datapod_id: datapod_id,
            buyer: buyer,
            seller: seller,
            price_sui: price_sui,
        });

        (purchase, cap)
    }

    /// Mark purchase as completed
    public fun complete_purchase(
        purchase: &mut PurchaseRequest,
        cap: &PurchaseOwnerCap,
        ctx: &mut TxContext,
    ) {
        assert!(purchase.status == 0, EInvalidStatus);
        assert!(cap.purchase_id == object::uid_to_address(&purchase.id), EUnauthorized);

        purchase.status = 1; // completed
        purchase.completed_at = tx_context::epoch(ctx);

        event::emit(PurchaseCompleted {
            purchase_id: object::uid_to_address(&purchase.id),
            buyer: purchase.buyer,
            seller: purchase.seller,
            price_sui: purchase.price_sui,
        });
    }

    /// Refund purchase
    public fun refund_purchase(
        purchase: &mut PurchaseRequest,
        cap: &PurchaseOwnerCap,
    ) {
        assert!(purchase.status == 0, EInvalidStatus);
        assert!(cap.purchase_id == object::uid_to_address(&purchase.id), EUnauthorized);

        purchase.status = 2; // refunded

        event::emit(PurchaseRefunded {
            purchase_id: object::uid_to_address(&purchase.id),
            buyer: purchase.buyer,
            price_sui: purchase.price_sui,
        });
    }

    /// Dispute purchase
    public fun dispute_purchase(
        purchase: &mut PurchaseRequest,
        ctx: &mut TxContext,
    ) {
        assert!(purchase.status == 0 || purchase.status == 1, EInvalidStatus);
        assert!(tx_context::sender(ctx) == purchase.buyer || tx_context::sender(ctx) == purchase.seller, EUnauthorized);

        purchase.status = 3; // disputed

        event::emit(PurchaseDisputed {
            purchase_id: object::uid_to_address(&purchase.id),
            buyer: purchase.buyer,
            seller: purchase.seller,
        });
    }

    // Getter functions
    public fun get_buyer(purchase: &PurchaseRequest): address {
        purchase.buyer
    }

    public fun get_seller(purchase: &PurchaseRequest): address {
        purchase.seller
    }

    public fun get_price(purchase: &PurchaseRequest): u64 {
        purchase.price_sui
    }

    public fun get_status(purchase: &PurchaseRequest): u8 {
        purchase.status
    }

    public fun get_data_hash(purchase: &PurchaseRequest): String {
        purchase.data_hash
    }
}
