import type { BookingReceipt, CreateBookingInput } from '@/features/booking/types';
import type { ApiBooking, ApiBookingReview, ApiPaymentIntent } from '../../../shared/api-contracts';
import { apiBaseUrl, ApiClientError, apiRequest } from '@/services/api-client';

interface BookingService {
  createBooking(input: CreateBookingInput, accessToken?: string, signal?: AbortSignal): Promise<BookingReceipt>;
  initiatePayment(bookingId: string, accessToken?: string): Promise<ApiPaymentIntent>;
  /** Asks the API to check a pending payment with the provider; null when nothing is pending. */
  verifyPayment(bookingId: string, accessToken?: string): Promise<PaymentVerification | null>;
  listBookings(accessToken?: string): Promise<readonly ApiBooking[]>;
  cancelBooking(bookingId: string, accessToken?: string): Promise<void>;
  /** Hides a finished booking from the client's history. */
  archiveBooking(bookingId: string, accessToken?: string): Promise<void>;
  rescheduleBooking(bookingId: string, dateIso: string, time: string, accessToken?: string): Promise<void>;
  submitReview(
    bookingId: string,
    input: { techniqueRating: number; professionalismRating: number; tags: readonly string[]; reviewText: string },
    accessToken?: string,
  ): Promise<ApiBookingReview>;
}

export interface PaymentVerification {
  paymentIntent: ApiPaymentIntent;
  status: 'captured' | 'failed' | 'pending';
  verified: boolean;
}

export class BookingServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_REQUEST' | 'SERVICE_UNAVAILABLE',
    /** HTTP status from the API when the failure came from a response (e.g. 429). */
    readonly status?: number,
    /** The API's own reason code (e.g. PROFESSIONAL_BUSY), so the screen can show a localized fallback message. */
    readonly apiCode?: string,
  ) {
    super(message);
    this.name = 'BookingServiceError';
  }
}

function validateBooking(input: CreateBookingInput) {
  const serviceFee = input.serviceFee ?? Math.round(input.servicePrice * 0.18);
  if (
    !input.requestId ||
    !input.professionalId ||
    !input.serviceName ||
    !input.dateIso ||
    !input.time ||
    !input.addressId ||
    input.total !== input.servicePrice + serviceFee + input.travelFee
  ) {
    throw new BookingServiceError('Some booking details are missing or invalid.', 'INVALID_REQUEST');
  }
}

function waitForDevelopmentResponse(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timeout = setTimeout(finish, 650);
    const abort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      const error = new Error('The booking request was cancelled.');
      error.name = 'AbortError';
      reject(error);
    };

    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

const developmentBookingService: BookingService = {
  async createBooking(input, _accessToken, signal) {
    validateBooking(input);
    await waitForDevelopmentResponse(signal);

    return {
      bookingId: `dev-${Date.now().toString(36)}`,
      paymentStatus: 'not_started',
      requestStatus: 'requested',
      createdAt: new Date().toISOString(),
      servicePrice: input.servicePrice,
      serviceFee: input.serviceFee ?? Math.round(input.servicePrice * 0.18),
      travelFee: input.travelFee,
      total: input.total,
    };
  },
  async cancelBooking() {
    await waitForDevelopmentResponse();
  },
  async archiveBooking() {
    await waitForDevelopmentResponse();
  },
  async verifyPayment() {
    await waitForDevelopmentResponse();
    return null;
  },
  async initiatePayment(bookingId) {
    await waitForDevelopmentResponse();
    const now = new Date().toISOString();
    return {
      id: `dev-payment-${bookingId}`,
      bookingId,
      provider: 'cash',
      providerReference: `dev-${bookingId}`,
      status: 'cash_due',
      amount: 0,
      refundedAmount: 0,
      currency: 'ETB',
      createdAt: now,
      updatedAt: now,
    };
  },
  async listBookings() {
    return [];
  },
  async rescheduleBooking() {
    await waitForDevelopmentResponse();
  },
  async submitReview(_bookingId, input) {
    await waitForDevelopmentResponse();
    return {
      id: `dev-review-${Date.now().toString(36)}`,
      techniqueRating: input.techniqueRating,
      professionalismRating: input.professionalismRating,
      tags: input.tags,
      reviewText: input.reviewText,
      createdAt: new Date().toISOString(),
    };
  },
};

const apiBookingService: BookingService = {
  async createBooking(input, accessToken, signal) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      const response = await apiRequest<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
        method: 'POST',
        token: accessToken,
        signal,
        body: {
          requestId: input.requestId,
          professionalId: input.professionalId,
          serviceId: input.serviceId,
          dateIso: input.dateIso,
          time: input.time,
          addressId: input.addressId,
          addressLabel: input.addressLabel,
          addressZone: input.addressZone,
          addressDetail: input.addressDetail,
          paymentMethod: input.paymentMethod,
        },
      });
      return {
        bookingId: response.booking.id,
        paymentStatus: 'not_started',
        requestStatus: 'requested',
        createdAt: response.booking.createdAt,
        servicePrice: response.booking.servicePrice,
        serviceFee: response.booking.serviceFee ?? Math.round(response.booking.servicePrice * 0.18),
        travelFee: response.booking.travelFee,
        discountAmount: response.booking.discountAmount ?? 0,
        discountReason: response.booking.discountReason ?? null,
        total: response.booking.total,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status, error.code);
      throw new BookingServiceError('We could not submit your booking. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async initiatePayment(bookingId, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      const response = await apiRequest<{ paymentIntent: ApiPaymentIntent }>(
        `/v1/bookings/${encodeURIComponent(bookingId)}/payment`,
        { method: 'POST', token: accessToken },
      );
      return response.paymentIntent;
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not start payment. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async verifyPayment(bookingId, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      return await apiRequest<PaymentVerification>(
        `/v1/bookings/${encodeURIComponent(bookingId)}/payment/verify`,
        { method: 'POST', token: accessToken },
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NO_PENDING_PAYMENT') return null;
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not confirm the payment yet. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async listBookings(accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      const response = await apiRequest<{ bookings: ApiBooking[] }>('/v1/bookings', {
        method: 'GET',
        token: accessToken,
      });
      return response.bookings;
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not load your bookings. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async cancelBooking(bookingId, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      await apiRequest(`/v1/bookings/${encodeURIComponent(bookingId)}`, {
        method: 'DELETE',
        token: accessToken,
      });
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not cancel your booking. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async archiveBooking(bookingId, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      await apiRequest(`/v1/bookings/${encodeURIComponent(bookingId)}/archive`, { method: 'POST', token: accessToken });
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not remove this booking. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async rescheduleBooking(bookingId, dateIso, time, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      await apiRequest(`/v1/bookings/${encodeURIComponent(bookingId)}/schedule`, {
        method: 'PATCH',
        token: accessToken,
        body: { dateIso, time },
      });
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not reschedule your booking. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
  async submitReview(bookingId, input, accessToken) {
    if (!accessToken) throw new BookingServiceError('Your session has expired. Please sign in again.', 'SERVICE_UNAVAILABLE');
    try {
      const response = await apiRequest<{ review: ApiBookingReview }>(
        `/v1/bookings/${encodeURIComponent(bookingId)}/review`,
        {
          method: 'POST',
          token: accessToken,
          body: {
            techniqueRating: input.techniqueRating,
            professionalismRating: input.professionalismRating,
            tags: [...input.tags],
            reviewText: input.reviewText,
          },
        },
      );
      return response.review;
    } catch (error) {
      if (error instanceof ApiClientError) throw new BookingServiceError(error.message, 'SERVICE_UNAVAILABLE', error.status);
      throw new BookingServiceError('We could not submit your review. Please try again.', 'SERVICE_UNAVAILABLE');
    }
  },
};

const unavailableBookingService: BookingService = {
  async createBooking() {
    throw new BookingServiceError(
      'Booking and payment are temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
  async verifyPayment() {
    throw new BookingServiceError('Payment confirmation is temporarily unavailable. Please try again later.', 'SERVICE_UNAVAILABLE');
  },
  async archiveBooking() {
    throw new BookingServiceError('Booking history is temporarily unavailable. Please try again later.', 'SERVICE_UNAVAILABLE');
  },
  async cancelBooking() {
    throw new BookingServiceError(
      'Booking cancellation is temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
  async initiatePayment() {
    throw new BookingServiceError(
      'Payment is temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
  async listBookings() {
    throw new BookingServiceError(
      'Booking history is temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
  async rescheduleBooking() {
    throw new BookingServiceError(
      'Booking rescheduling is temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
  async submitReview() {
    throw new BookingServiceError(
      'Review submission is temporarily unavailable. Please try again later.',
      'SERVICE_UNAVAILABLE',
    );
  },
};

export const bookingService: BookingService = apiBaseUrl
  ? apiBookingService
  : __DEV__ ? developmentBookingService : unavailableBookingService;
