# Reviews API Documentation

## Overview
API endpoints untuk mengelola review DataPod di platform SourceNet. Review hanya dapat dibuat oleh buyer yang telah menyelesaikan pembelian DataPod.

**Base URL**: `http://localhost:3001/api/review`

---

## Authentication
Semua endpoint yang memerlukan autentikasi harus menyertakan JWT token di header:

```http
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Create or Update Review

**Endpoint**: `POST /api/review`

**Authentication**: ✅ Required

**Description**: Membuat review baru atau mengupdate review yang sudah ada untuk DataPod yang telah dibeli.

#### Request Headers
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

#### Request Body
```typescript
{
  "purchaseRequestId": string;  // ID purchase request (on-chain ID)
  "datapodId": string;          // UUID DataPod
  "rating": number;             // Rating 1-5
  "comment"?: string;           // Optional, komentar review
}
```

#### Example Request
```bash
curl -X POST http://localhost:3001/api/review \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseRequestId": "0x1234567890abcdef",
    "datapodId": "550e8400-e29b-41d4-a716-446655440000",
    "rating": 5,
    "comment": "Data sangat berkualitas dan sesuai deskripsi!"
  }'
```

#### Success Response (201 Created)
```typescript
{
  "status": "success",
  "data": {
    "review": {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "datapodId": "550e8400-e29b-41d4-a716-446655440000",
      "purchaseRequestId": "0x1234567890abcdef",
      "buyerId": "770e8400-e29b-41d4-a716-446655440000",
      "buyerAddress": "0xabc123...",
      "rating": 5,
      "comment": "Data sangat berkualitas dan sesuai deskripsi!",
      "createdAt": "2025-11-23T06:42:54.000Z"
    }
  }
}
```

#### Error Responses

**401 Unauthorized** - User tidak terautentikasi
```typescript
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "User not authenticated"
  }
}
```

**400 Bad Request** - Rating tidak valid
```typescript
{
  "error": {
    "code": "INVALID_RATING",
    "message": "Rating must be between 1 and 5"
  }
}
```

**404 Not Found** - Purchase request tidak ditemukan
```typescript
{
  "error": {
    "code": "PURCHASE_NOT_FOUND",
    "message": "Purchase request not found"
  }
}
```

**403 Forbidden** - Bukan buyer dari purchase ini
```typescript
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Only the buyer can leave a review"
  }
}
```

**400 Bad Request** - Purchase belum completed
```typescript
{
  "error": {
    "code": "PURCHASE_NOT_COMPLETED",
    "message": "Can only review completed purchases"
  }
}
```

**500 Internal Server Error**
```typescript
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to create review"
  }
}
```

---

### 2. Get DataPod Reviews

**Endpoint**: `GET /api/review/datapod/:datapodId`

**Authentication**: ❌ Not Required (Public)

**Description**: Mendapatkan semua review untuk DataPod tertentu dengan pagination.

#### URL Parameters
- `datapodId` (string, required): UUID DataPod

#### Query Parameters
```typescript
{
  "limit"?: number;   // Default: 10, jumlah review per halaman
  "offset"?: number;  // Default: 0, offset untuk pagination
}
```

#### Example Request
```bash
curl -X GET "http://localhost:3001/api/review/datapod/550e8400-e29b-41d4-a716-446655440000?limit=10&offset=0"
```

#### Success Response (200 OK)
```typescript
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "datapodId": "550e8400-e29b-41d4-a716-446655440000",
        "purchaseRequestId": "0x1234567890abcdef",
        "buyerId": "770e8400-e29b-41d4-a716-446655440000",
        "buyerAddress": "0xabc123...",
        "rating": 5,
        "comment": "Data sangat berkualitas dan sesuai deskripsi!",
        "createdAt": "2025-11-23T06:42:54.000Z",
        "buyer": {
          "id": "770e8400-e29b-41d4-a716-446655440000",
          "username": "john_doe",
          "avatarUrl": "https://example.com/avatar.jpg"
        }
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "datapodId": "550e8400-e29b-41d4-a716-446655440000",
        "purchaseRequestId": "0x9876543210fedcba",
        "buyerId": "770e8400-e29b-41d4-a716-446655440001",
        "buyerAddress": "0xdef456...",
        "rating": 4,
        "comment": "Bagus, tapi bisa lebih lengkap",
        "createdAt": "2025-11-22T10:30:00.000Z",
        "buyer": {
          "id": "770e8400-e29b-41d4-a716-446655440001",
          "username": "jane_smith",
          "avatarUrl": null
        }
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0
    }
  }
}
```

#### Error Response (500 Internal Server Error)
```typescript
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to get reviews"
  }
}
```

---

### 3. Get My Reviews

**Endpoint**: `GET /api/review/my-reviews`

**Authentication**: ✅ Required

**Description**: Mendapatkan semua review yang dibuat oleh user yang sedang login.

#### Request Headers
```http
Authorization: Bearer <jwt_token>
```

#### Query Parameters
```typescript
{
  "limit"?: number;   // Default: 10
  "offset"?: number;  // Default: 0
}
```

#### Example Request
```bash
curl -X GET "http://localhost:3001/api/review/my-reviews?limit=10&offset=0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Success Response (200 OK)
```typescript
{
  "status": "success",
  "data": {
    "reviews": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "datapodId": "550e8400-e29b-41d4-a716-446655440000",
        "purchaseRequestId": "0x1234567890abcdef",
        "buyerId": "770e8400-e29b-41d4-a716-446655440000",
        "buyerAddress": "0xabc123...",
        "rating": 5,
        "comment": "Data sangat berkualitas!",
        "createdAt": "2025-11-23T06:42:54.000Z",
        "datapod": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "datapodId": "0xdatapod123...",
          "title": "E-commerce Sales Data 2024",
          "category": "business"
        }
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 10,
      "offset": 0
    }
  }
}
```

#### Error Responses

**401 Unauthorized**
```typescript
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "User not authenticated"
  }
}
```

**500 Internal Server Error**
```typescript
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to get reviews"
  }
}
```

---

### 4. Delete Review

**Endpoint**: `DELETE /api/review/:reviewId`

**Authentication**: ✅ Required

**Description**: Menghapus review yang telah dibuat. User hanya dapat menghapus review miliknya sendiri.

#### URL Parameters
- `reviewId` (string, required): UUID review

#### Request Headers
```http
Authorization: Bearer <jwt_token>
```

#### Example Request
```bash
curl -X DELETE http://localhost:3001/api/review/660e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Success Response (200 OK)
```typescript
{
  "status": "success",
  "message": "Review deleted successfully"
}
```

#### Error Responses

**401 Unauthorized**
```typescript
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "User not authenticated"
  }
}
```

**404 Not Found**
```typescript
{
  "error": {
    "code": "REVIEW_NOT_FOUND",
    "message": "Review not found"
  }
}
```

**403 Forbidden** - Mencoba menghapus review orang lain
```typescript
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You can only delete your own reviews"
  }
}
```

**500 Internal Server Error**
```typescript
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to delete review"
  }
}
```

---

## TypeScript Types

### Review Object
```typescript
interface Review {
  id: string;                    // UUID
  datapodId: string;             // UUID
  purchaseRequestId: string;     // On-chain ID
  buyerId: string;               // UUID
  buyerAddress: string;          // Sui address
  rating: number;                // 1-5
  comment: string | null;        // Optional comment
  createdAt: string;             // ISO 8601 timestamp
}
```

### Review with Buyer Info
```typescript
interface ReviewWithBuyer extends Review {
  buyer: {
    id: string;
    username: string | null;
    avatarUrl: string | null;
  };
}
```

### Review with DataPod Info
```typescript
interface ReviewWithDataPod extends Review {
  datapod: {
    id: string;
    datapodId: string;           // On-chain ID
    title: string;
    category: string;
  };
}
```

### Pagination
```typescript
interface Pagination {
  total: number;
  limit: number;
  offset: number;
}
```

---

## Frontend Integration Examples

### React/Next.js Example

#### 1. Create Review
```typescript
const createReview = async (
  purchaseRequestId: string,
  datapodId: string,
  rating: number,
  comment?: string
) => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:3001/api/review', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      purchaseRequestId,
      datapodId,
      rating,
      comment,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
};

// Usage
try {
  const result = await createReview(
    '0x1234567890abcdef',
    '550e8400-e29b-41d4-a716-446655440000',
    5,
    'Excellent data quality!'
  );
  console.log('Review created:', result.data.review);
} catch (error) {
  console.error('Failed to create review:', error.message);
}
```

#### 2. Get DataPod Reviews
```typescript
const getDataPodReviews = async (
  datapodId: string,
  limit: number = 10,
  offset: number = 0
) => {
  const response = await fetch(
    `http://localhost:3001/api/review/datapod/${datapodId}?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch reviews');
  }

  return await response.json();
};

// Usage
const { data } = await getDataPodReviews('550e8400-e29b-41d4-a716-446655440000');
console.log('Reviews:', data.reviews);
console.log('Total:', data.pagination.total);
```

#### 3. Get My Reviews
```typescript
const getMyReviews = async (limit: number = 10, offset: number = 0) => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(
    `http://localhost:3001/api/review/my-reviews?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch my reviews');
  }

  return await response.json();
};
```

#### 4. Delete Review
```typescript
const deleteReview = async (reviewId: string) => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(
    `http://localhost:3001/api/review/${reviewId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
};
```

---

## React Component Example

```typescript
import { useState, useEffect } from 'react';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  buyer: {
    username: string | null;
    avatarUrl: string | null;
  };
}

export function DataPodReviews({ datapodId }: { datapodId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, limit: 10, offset: 0 });

  useEffect(() => {
    fetchReviews();
  }, [datapodId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:3001/api/review/datapod/${datapodId}?limit=${pagination.limit}&offset=${pagination.offset}`
      );
      const { data } = await response.json();
      setReviews(data.reviews);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  if (loading) return <div>Loading reviews...</div>;

  return (
    <div className="reviews-section">
      <h2>Reviews ({pagination.total})</h2>
      
      {reviews.length === 0 ? (
        <p>No reviews yet. Be the first to review!</p>
      ) : (
        <div className="reviews-list">
          {reviews.map((review) => (
            <div key={review.id} className="review-card">
              <div className="review-header">
                <img 
                  src={review.buyer.avatarUrl || '/default-avatar.png'} 
                  alt={review.buyer.username || 'Anonymous'}
                  className="avatar"
                />
                <div>
                  <p className="username">{review.buyer.username || 'Anonymous'}</p>
                  <p className="rating">{renderStars(review.rating)}</p>
                </div>
              </div>
              {review.comment && (
                <p className="comment">{review.comment}</p>
              )}
              <p className="date">
                {new Date(review.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
      
      {pagination.total > pagination.limit && (
        <button onClick={() => {
          setPagination({ ...pagination, offset: pagination.offset + pagination.limit });
          fetchReviews();
        }}>
          Load More
        </button>
      )}
    </div>
  );
}
```

---

## Business Logic Notes

### Rating Calculation
- Setiap kali review dibuat, diupdate, atau dihapus, sistem akan otomatis menghitung ulang `averageRating` untuk DataPod tersebut
- `averageRating` disimpan di tabel `data_pods` untuk performa query

### Review Constraints
- User hanya bisa review DataPod yang sudah dibeli (`status: 'completed'`)
- Satu user hanya bisa membuat satu review per DataPod (upsert behavior)
- User hanya bisa menghapus review miliknya sendiri

### Pagination
- Default limit: 10 reviews per request
- Gunakan `offset` untuk pagination
- Total count tersedia di response untuk menghitung total halaman

---

## Error Handling Best Practices

```typescript
const handleReviewSubmit = async (data: ReviewData) => {
  try {
    const result = await createReview(data);
    toast.success('Review submitted successfully!');
    return result;
  } catch (error) {
    if (error.message.includes('PURCHASE_NOT_COMPLETED')) {
      toast.error('You can only review completed purchases');
    } else if (error.message.includes('FORBIDDEN')) {
      toast.error('You can only review your own purchases');
    } else if (error.message.includes('INVALID_RATING')) {
      toast.error('Please provide a rating between 1 and 5');
    } else {
      toast.error('Failed to submit review. Please try again.');
    }
    throw error;
  }
};
```

---

## Testing

### Manual Testing dengan curl

```bash
# 1. Login dan dapatkan token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/zklogin/callback \
  -H "Content-Type: application/json" \
  -d '{"jwt": "...", "salt": "..."}' | jq -r '.data.token')

# 2. Create review
curl -X POST http://localhost:3001/api/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseRequestId": "0x123...",
    "datapodId": "550e8400-e29b-41d4-a716-446655440000",
    "rating": 5,
    "comment": "Great data!"
  }'

# 3. Get reviews
curl http://localhost:3001/api/review/datapod/550e8400-e29b-41d4-a716-446655440000

# 4. Get my reviews
curl http://localhost:3001/api/review/my-reviews \
  -H "Authorization: Bearer $TOKEN"

# 5. Delete review
curl -X DELETE http://localhost:3001/api/review/660e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

---

## FAQ

**Q: Apakah user bisa review DataPod yang belum dibeli?**  
A: Tidak. User hanya bisa review DataPod yang sudah dibeli dan statusnya `completed`.

**Q: Apakah user bisa membuat multiple review untuk satu DataPod?**  
A: Tidak. Sistem menggunakan upsert, jadi jika user sudah pernah review, request berikutnya akan mengupdate review yang ada.

**Q: Apakah review bisa diedit?**  
A: Ya, dengan memanggil endpoint `POST /api/review` lagi dengan `purchaseRequestId` yang sama. Sistem akan mengupdate review yang ada.

**Q: Apakah review publik?**  
A: Ya, endpoint `GET /api/review/datapod/:datapodId` tidak memerlukan autentikasi, jadi semua orang bisa melihat review.

**Q: Bagaimana cara menghitung total halaman untuk pagination?**  
A: `totalPages = Math.ceil(pagination.total / pagination.limit)`
