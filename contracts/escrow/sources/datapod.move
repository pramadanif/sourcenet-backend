/// DataPod module for SourceNet data marketplace
/// Manages data pod listings and metadata
module sourcenet::datapod {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::string::String;

    /// DataPod represents a data listing
    public struct DataPod has key, store {
        id: UID,
        datapod_id: String,
        seller: address,
        title: String,
        category: String,
        description: String,
        price_sui: u64,
        data_hash: String,
        blob_id: String,
        kiosk_id: String,
        status: u8, // 0: draft, 1: published, 2: delisted
        total_sales: u64,
        average_rating: u64, // stored as basis points (e.g., 450 = 4.5)
        created_at: u64,
        published_at: u64,
    }

    /// DataPod owner capability
    public struct DataPodOwnerCap has key, store {
        id: UID,
        datapod_id: address,
    }

    // Events
    public struct DataPodCreated has copy, drop {
        datapod_id: address,
        seller: address,
        title: String,
        category: String,
        price_sui: u64,
    }

    public struct DataPodPublished has copy, drop {
        datapod_id: address,
        seller: address,
        title: String,
        category: String,
        price_sui: u64,
        kiosk_id: String,
    }

    public struct DataPodDelisted has copy, drop {
        datapod_id: address,
        seller: address,
    }

    public struct DataPodPriceUpdated has copy, drop {
        datapod_id: address,
        old_price: u64,
        new_price: u64,
    }

    // Errors
    const EInvalidStatus: u64 = 1;
    const EUnauthorized: u64 = 2;
    const EInvalidPrice: u64 = 3;
    const EInvalidTitle: u64 = 4;

    /// Create new DataPod
    public fun create_datapod(
        datapod_id: String,
        title: String,
        category: String,
        description: String,
        price_sui: u64,
        data_hash: String,
        blob_id: String,
        ctx: &mut TxContext,
    ): (DataPod, DataPodOwnerCap) {
        assert!(price_sui > 0, EInvalidPrice);

        let id = object::new(ctx);
        let datapod_addr = object::uid_to_address(&id);
        let sender = tx_context::sender(ctx);

        let datapod = DataPod {
            id: id,
            datapod_id: datapod_id,
            seller: sender,
            title: title,
            category: category,
            description: description,
            price_sui: price_sui,
            data_hash: data_hash,
            blob_id: blob_id,
            kiosk_id: std::string::utf8(b""),
            status: 0, // draft
            total_sales: 0,
            average_rating: 0,
            created_at: tx_context::epoch(ctx),
            published_at: 0,
        };

        let cap = DataPodOwnerCap {
            id: object::new(ctx),
            datapod_id: datapod_addr,
        };

        event::emit(DataPodCreated {
            datapod_id: datapod_addr,
            seller: sender,
            title: datapod.title,
            category: datapod.category,
            price_sui: price_sui,
        });

        (datapod, cap)
    }

    /// Publish DataPod to marketplace
    public fun publish_datapod(
        datapod: &mut DataPod,
        kiosk_id: String,
        cap: &DataPodOwnerCap,
        ctx: &mut TxContext,
    ) {
        assert!(datapod.status == 0 || datapod.status == 2, EInvalidStatus);
        assert!(cap.datapod_id == object::uid_to_address(&datapod.id), EUnauthorized);

        datapod.status = 1; // published
        datapod.kiosk_id = kiosk_id;
        datapod.published_at = tx_context::epoch(ctx);

        event::emit(DataPodPublished {
            datapod_id: object::uid_to_address(&datapod.id),
            seller: datapod.seller,
            title: datapod.title,
            category: datapod.category,
            price_sui: datapod.price_sui,
            kiosk_id: datapod.kiosk_id,
        });
    }

    /// Delist DataPod from marketplace
    public fun delist_datapod(
        datapod: &mut DataPod,
        cap: &DataPodOwnerCap,
        ctx: &mut TxContext,
    ) {
        assert!(datapod.status == 1, EInvalidStatus);
        assert!(cap.datapod_id == object::uid_to_address(&datapod.id), EUnauthorized);

        datapod.status = 2; // delisted

        event::emit(DataPodDelisted {
            datapod_id: object::uid_to_address(&datapod.id),
            seller: datapod.seller,
        });
    }

    /// Update DataPod price
    public fun update_price(
        datapod: &mut DataPod,
        new_price: u64,
        cap: &DataPodOwnerCap,
    ) {
        assert!(new_price > 0, EInvalidPrice);
        assert!(cap.datapod_id == object::uid_to_address(&datapod.id), EUnauthorized);

        let old_price = datapod.price_sui;
        datapod.price_sui = new_price;

        event::emit(DataPodPriceUpdated {
            datapod_id: object::uid_to_address(&datapod.id),
            old_price: old_price,
            new_price: new_price,
        });
    }

    /// Increment total sales
    public fun increment_sales(datapod: &mut DataPod) {
        datapod.total_sales = datapod.total_sales + 1;
    }

    /// Update average rating
    public fun update_rating(datapod: &mut DataPod, new_rating: u64) {
        datapod.average_rating = new_rating;
    }

    // Getter functions
    public fun get_seller(datapod: &DataPod): address {
        datapod.seller
    }

    public fun get_price(datapod: &DataPod): u64 {
        datapod.price_sui
    }

    public fun get_status(datapod: &DataPod): u8 {
        datapod.status
    }

    public fun get_data_hash(datapod: &DataPod): String {
        datapod.data_hash
    }

    public fun get_total_sales(datapod: &DataPod): u64 {
        datapod.total_sales
    }

    public fun get_rating(datapod: &DataPod): u64 {
        datapod.average_rating
    }
}
