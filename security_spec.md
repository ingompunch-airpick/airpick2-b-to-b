# Security Specification

## 1. Data Invariants
- **Parking Companies (`/companies/{companyId}`)**: Only verified admins (`drive5746@gmail.com` and `ingompunch@gmail.com`) can create, update, or delete company documents. Each company document must contain valid non-negative pricing numbers, supporting terminals information, and support indicators.
- **Reservations (`/reservations/{reservationId}`)**:
  - Anyone can create a reservation if they are signed in and verified.
  - The `userId` in the reservation must match the sign-in `request.auth.uid` to prevent identity spoofing.
  - The `createdAt` timestamp must be exactly equal to `request.time` (the server value).
  - Regular users can only list and read reservations they own (i.e. where `resource.data.userId == request.auth.uid`).
  - Regular users can only update their own reservation's status to `'cancelled'`, and are restricted from updating immutable fields like `userId`, `companyId`, `totalPrice`, and `createdAt`.
  - Admins can manage all reservations.
- **Parking Lots (`/parking_lots/{lotId}`)**: Everyone can view parking lot lists, but only admins can create, update, or delete lot documents.

---

## 2. The "Dirty Dozen" Payloads
The following payloads are configured to simulate attack vectors and verify they are rejected with `PERMISSION_DENIED`:

1. **Spoofed Company Doc**: A non-admin is trying to create a parking company.
2. **Missing Base Price**: Creating a company with invalid or missing `base_price` field.
3. **Negative Price**: Creating a company with negative pricing figures.
4. **Reservation Hijack**: Creating a reservation where `userId` is set to different user `user_xyz` instead of `request.auth.uid`.
5. **Unverified Auth**: Attempting to reserve while `request.auth.token.email_verified` is false.
6. **Time Shortcutting**: Attempting to create a reservation with a spoofed `createdAt` field that does not match `request.time`.
7. **Negative Reservation Price**: Reservation with a negative `totalPrice` value.
8. **Status Escalation**: Non-owner/non-admin trying to update a reservation status directly.
9. **Field Mutation**: Regular user attempting to mutate fields of an existing reservation (e.g. `companyId`).
10. **ID Poisoning Attack**: Trying to create/update a document using a junk target ID greater than 128 characters or containing illegal characters.
11. **PII Blanket Query Leak**: Attempting a list query on all reservations without limiting the query to the current user's UID.
12. **ParkingLot Sabotage**: Regular user attempting to create or modify a `/parking_lots/{lotId}` document.

---

## 3. The Test Runner Reference
The rules-based logic matches all payloads against strict checks. A reference file `firestore.rules.test.ts` is created to illustrate tests verifying standard rejection.
