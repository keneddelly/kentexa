'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ApiError,
  approveRegistration,
  deleteRegistration,
  getRegistration,
  rejectRegistration,
} from '@/lib/apiClient';
import type { Registration } from '@/lib/types';
import { formatEnumLabel } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import StatusBadge from '@/components/admin/StatusBadge';
import ImageGallery from '@/components/admin/ImageGallery';
import RejectReasonModal from '@/components/admin/RejectReasonModal';
import { RegistrationStatus } from '@/lib/types';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800 dark:text-gray-100">{value}</dd>
    </div>
  );
}

export default function AdminRegistrationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [registration, setRegistration] = useState<Registration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);

  const load = () => {
    setIsLoading(true);
    getRegistration(id)
      .then(setRegistration)
      .catch((err) => {
        if (err instanceof ApiError && err.statusCode === 403) {
          setForbidden(true);
        } else if (err instanceof ApiError && err.statusCode === 404) {
          setError('Registration not found.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load registration');
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleApprove = async () => {
    setIsActing(true);
    try {
      const updated = await approveRegistration(id);
      setRegistration(updated);
      toast.success('Registration approved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setIsActing(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    setIsActing(true);
    try {
      const updated = await rejectRegistration(id, reason);
      setRegistration(updated);
      toast.success('Registration rejected');
      setIsRejectOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setIsActing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this registration? This cannot be undone.')) return;
    setIsActing(true);
    try {
      await deleteRegistration(id);
      toast.success('Registration deleted');
      router.push('/admin/registrations');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
      setIsActing(false);
    }
  };

  if (forbidden) {
    return (
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
        <h2 className="mb-1 text-lg font-semibold">Not authorized</h2>
        <p className="text-sm">You do not have Admin or Manager access to view this registration.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (isLoading || !registration) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Card>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const images = [
    registration.logoUrl ? { url: registration.logoUrl, label: 'Logo' } : null,
    registration.coverImageUrl ? { url: registration.coverImageUrl, label: 'Cover Image' } : null,
    ...(registration.photoUrls ?? []).map((url, i) => ({ url, label: `Photo ${i + 1}` })),
  ].filter(Boolean) as { url: string; label: string }[];

  return (
    <div>
      <Link
        href="/admin/registrations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-light"
      >
        ← Back to registrations
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{registration.businessName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-mono">{registration.earlyAccessId}</span>
            <StatusBadge status={registration.status} />
          </p>
        </div>
        <div className="flex gap-2">
          {registration.status === RegistrationStatus.PENDING && (
            <>
              <Button onClick={handleApprove} isLoading={isActing}>
                Approve
              </Button>
              <Button variant="outline" onClick={() => setIsRejectOpen(true)} disabled={isActing}>
                Reject
              </Button>
            </>
          )}
          <Button variant="danger" onClick={handleDelete} disabled={isActing}>
            Delete
          </Button>
        </div>
      </div>

      {registration.status === RegistrationStatus.REJECTED && registration.rejectionReason && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <strong>Rejection reason:</strong> {registration.rejectionReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Business Information</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Account Type" value={formatEnumLabel(registration.accountType)} />
              <Field label="Category" value={formatEnumLabel(registration.businessCategory)} />
              <Field label="Owner Name" value={registration.ownerName} />
              <Field label="Phone" value={registration.phone} />
              <Field label="WhatsApp" value={registration.whatsapp} />
              <Field label="Email" value={registration.email} />
              <Field label="Years in Business" value={registration.yearsInBusiness} />
              <Field
                label="Location"
                value={[registration.ward, registration.district, registration.region].filter(Boolean).join(', ')}
              />
              <Field
                label="Coordinates"
                value={
                  registration.latitude !== undefined && registration.longitude !== undefined
                    ? `${registration.latitude}, ${registration.longitude}`
                    : undefined
                }
              />
            </dl>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <Field label="Description" value={registration.businessDescription} />
              <Field label="Products / Services" value={registration.productsOrServices} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Online Presence</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Website" value={registration.website} />
              <Field label="Facebook" value={registration.facebook} />
              <Field label="Instagram" value={registration.instagram} />
              <Field label="TikTok" value={registration.tiktok} />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Tell Us More</h2>
            <dl className="grid grid-cols-1 gap-4">
              <Field label="Biggest Challenge" value={registration.biggestChallenge} />
              <Field label="Vehicle Type" value={registration.vehicleType} />
              <Field
                label="Has License"
                value={registration.hasLicense === true ? 'Yes' : registration.hasLicense === false ? 'No' : undefined}
              />
              <Field label="Cargo Capacity" value={registration.cargoCapacity} />
              <Field label="Route Type" value={registration.routeType} />
              <Field label="Coverage Regions" value={registration.coverageRegions?.join(', ')} />
              <Field label="Coverage Areas (notes)" value={registration.coverageAreas} />
              <Field label="Selling Channels" value={registration.currentSellingChannels?.join(', ')} />
              <Field label="Ready Product Count" value={registration.readyProductCount} />
              <Field label="Price Range" value={registration.priceRange} />
              <Field
                label="Travels To Customer"
                value={
                  registration.travelsToCustomer === true
                    ? 'Yes'
                    : registration.travelsToCustomer === false
                      ? 'No'
                      : undefined
                }
              />
              <Field label="Booking Method" value={registration.currentBookingMethod} />
              <Field label="Pricing Model" value={registration.pricingModel} />
              <Field
                label="Has Physical Location"
                value={
                  registration.hasPhysicalLocation === true
                    ? 'Yes'
                    : registration.hasPhysicalLocation === false
                      ? 'No'
                      : undefined
                }
              />
              <Field label="Operating Hours" value={registration.operatingHours} />
              <Field label="Agent Type" value={registration.agentType} />
              <Field label="Daily Capacity" value={registration.dailyCapacity} />
              <Field
                label="Can Handle Cash Collection"
                value={
                  registration.canHandleCashCollection === true
                    ? 'Yes'
                    : registration.canHandleCashCollection === false
                      ? 'No'
                      : undefined
                }
              />
              <Field label="Employee Count" value={registration.employeeCount} />
              <Field
                label="Needs Delivery Support"
                value={
                  registration.needsDeliverySupport === true
                    ? 'Yes'
                    : registration.needsDeliverySupport === false
                      ? 'No'
                      : undefined
                }
              />
              {/* Legacy fields from the old generic questions step, shown only for older rows */}
              {registration.howCustomersFindYou && (
                <Field label="How Customers Find You (legacy)" value={registration.howCustomersFindYou} />
              )}
              {registration.onlinePlatformsUsed && registration.onlinePlatformsUsed.length > 0 && (
                <Field label="Platforms Used (legacy)" value={registration.onlinePlatformsUsed.join(', ')} />
              )}
              {registration.desiredKentexaFeature && (
                <Field label="Desired Feature (legacy)" value={registration.desiredKentexaFeature} />
              )}
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Media</h2>
            <ImageGallery images={images} />
          </Card>
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">Meta</h2>
            <dl className="flex flex-col gap-3">
              <Field label="Consent to Contact" value={registration.consentToContact ? 'Yes' : 'No'} />
              <Field label="Created" value={new Date(registration.createdAt).toLocaleString()} />
              <Field label="Updated" value={new Date(registration.updatedAt).toLocaleString()} />
            </dl>
          </Card>
        </div>
      </div>

      <RejectReasonModal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        onConfirm={handleRejectConfirm}
        isSubmitting={isActing}
      />
    </div>
  );
}
