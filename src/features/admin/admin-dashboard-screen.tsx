import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { AdminApplicationReviewCard } from '@/features/admin/admin-application-review-card';
import type { AdminDashboardData } from '@/features/admin/admin-service';
import { adminService } from '@/features/admin/admin-service';
import { describePayoutMethod } from '../../../shared/payout-method';
import { AdminDocumentReviewSection } from '@/features/admin/documents/admin-document-review-section';
import { useAuthSession } from '@/features/auth/session-context';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';
import type {
  ApiAdminBooking,
  ApiAdminProfessionalApplication,
  ApiBookingStatus,
} from '../../../shared/api-contracts';

// Colors and type scale follow premium-mobile-app-design/project/Konjo Admin Panel.dc.html.
const c = {
  sidebar: '#212822',
  canvas: '#FAF9F5',
  surface: '#FFFFFF',
  border: '#E6E8E2',
  headerRow: '#F5F4EF',
  text: '#212822',
  secondary: '#5F665C',
  muted: '#9DA399',
  sage: '#9CAF88',
  olive: '#586851',
  greenSoft: '#E9F0E6',
  gold: '#C5A059',
  goldText: '#775A19',
  goldSoft: 'rgba(197,160,89,0.15)',
  danger: '#BA1A1A',
  dangerSoft: '#FFDAD6',
  white: '#FFFFFF',
};
const display = 'BodoniModa_500Medium';
const body = 'PlusJakartaSans_400Regular';
const bodySemibold = 'PlusJakartaSans_600SemiBold';
const bodyBold = 'PlusJakartaSans_700Bold';

type Section = 'dispatch' | 'verification' | 'professionals' | 'disputes' | 'escrow' | 'zones' | 'analytics';

const statusMeta: Record<ApiBookingStatus, { label: string; bg: string; color: string }> = {
  requested: { label: 'Awaiting pro', bg: c.dangerSoft, color: c.danger },
  accepted: { label: 'Assigned', bg: c.greenSoft, color: c.olive },
  on_the_way: { label: 'On the way', bg: c.greenSoft, color: c.olive },
  in_progress: { label: 'In progress', bg: c.goldSoft, color: c.goldText },
  completed: { label: 'Completed', bg: c.headerRow, color: c.secondary },
  cancelled: { label: 'Cancelled', bg: c.headerRow, color: c.muted },
};

const feePresets = [0, 100, 150, 200];

function money(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * Konjo's take on a booking is the service fee the client pays on top of the
 * service price (it mirrors the commission rate). The professional keeps the
 * full service price and the travel fee, so neither is commissionable.
 */
function commissionOf(booking: ApiAdminBooking): number {
  return booking.serviceFee ?? Math.round((booking.servicePrice * booking.commissionRateBps) / 10_000);
}

function shortId(id: string): string {
  return id.length > 10 ? `KJ-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}` : id;
}

function isToday(dateIso: string): boolean {
  return dateIso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function weekStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

// ---------------------------------------------------------------------------
// Icons (same strokes as the design)
// ---------------------------------------------------------------------------
function NavIcon({ section, color }: { section: Section; color: string }) {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8 };
  switch (section) {
    case 'dispatch':
      return <Svg {...common}><Circle cx={12} cy={12} r={3} /><Path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></Svg>;
    case 'verification':
      return <Svg {...common}><Path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /></Svg>;
    case 'professionals':
      return <Svg {...common}><Circle cx={9} cy={8} r={3.2} /><Path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><Path d="M16 5.5a3 3 0 0 1 0 5.8M18 14.3c1.8.8 3 2.6 3 4.7" /></Svg>;
    case 'disputes':
      return <Svg {...common}><Path d="M12 9v4M12 17h.01" /><Path d="M10.3 3.9L2.5 17.5a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5L13.7 3.9a1 1 0 0 0-1.7 0z" /></Svg>;
    case 'escrow':
      return <Svg {...common}><Rect x={2} y={6} width={20} height={13} rx={2} /><Circle cx={12} cy={12.5} r={3} /></Svg>;
    case 'zones':
      return <Svg {...common}><Path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><Circle cx={12} cy={9} r={2.5} /></Svg>;
    default:
      return <Svg {...common}><Path d="M4 20V10M11 20V4M18 20v-7" /></Svg>;
  }
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------
function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'danger' | 'gold' }) {
  return (
    <View style={styles.kpi}>
      <Text numberOfLines={1} style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone === 'danger' && { color: c.danger }, tone === 'gold' && { color: c.gold }]}>{value}</Text>
    </View>
  );
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

function Table({ columns, children, minWidth = 760 }: { columns: readonly (readonly [string, number])[]; children: React.ReactNode; minWidth?: number }) {
  return (
    <View style={styles.tableCard}>
      <HorizontalScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, minWidth }}>
          <View style={[styles.row, styles.headerRow]}>
            {columns.map(([label, flex], index) => (
              <Text key={`${label}-${index}`} numberOfLines={1} style={[styles.headerCell, { flex }]}>{label}</Text>
            ))}
          </View>
          {children}
        </View>
      </HorizontalScrollView>
    </View>
  );
}

function Cell({ flex, children, strong, muted }: { flex: number; children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <View style={{ flex }}>
      {typeof children === 'string' || typeof children === 'number'
        ? <Text numberOfLines={2} style={[styles.cellText, strong && styles.cellStrong, muted && styles.cellMuted]}>{children}</Text>
        : children}
    </View>
  );
}

function LinkAction({ label, onPress, danger, disabled }: { label: string; onPress(): void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [(pressed || disabled) && { opacity: 0.5 }]}>
      <Text style={[styles.linkAction, danger && { color: c.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Empty({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function DispatchSection({ data, onResolveIncident }: { data: AdminDashboardData; onResolveIncident(id: string): void }) {
  const bookings = data.bookings;
  const active = bookings.filter((booking) => booking.status !== 'completed' && booking.status !== 'cancelled');
  const awaiting = bookings.filter((booking) => booking.status === 'requested');
  const today = bookings.filter((booking) => isToday(booking.dateIso) && booking.status !== 'cancelled');
  const gmvToday = today.reduce((sum, booking) => sum + booking.total, 0);
  const commissionToday = today.reduce((sum, booking) => sum + commissionOf(booking), 0);
  const incidents = data.safetyIncidents.filter((incident) => incident.status === 'open');
  const columns = [['Booking', 1], ['Client', 1.1], ['Pro', 1.1], ['Service', 1.2], ['Zone', 0.8], ['Status', 1], ['Time', 0.9], ['Amount', 0.9]] as const;

  return (
    <View>
      <PageTitle subtitle="Bookings across Addis Ababa, refreshed in real time" title="Live dispatch" />
      {incidents.length ? (
        <View style={styles.alert}>
          <Text style={styles.alertTitle}>{incidents.length} open SOS alert{incidents.length === 1 ? '' : 's'}</Text>
          {incidents.map((incident) => (
            <View key={incident.id} style={styles.alertRow}>
              <Text style={styles.alertText}>
                {incident.reportedByRole} · booking {shortId(incident.bookingId)} · {new Date(incident.createdAt).toLocaleString()}
              </Text>
              <LinkAction danger label="Mark handled" onPress={() => onResolveIncident(incident.id)} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.kpiGrid}>
        <Kpi label="Active bookings" value={active.length} />
        <Kpi label="Awaiting pro" tone="danger" value={awaiting.length} />
        <Kpi label="GMV today" value={`ETB ${money(gmvToday)}`} />
        <Kpi label="Commission today" tone="gold" value={`ETB ${money(commissionToday)}`} />
      </View>
      <Table columns={columns} minWidth={900}>
        {bookings.map((booking) => {
          const meta = statusMeta[booking.status];
          return (
            <View key={booking.id} style={styles.row}>
              <Cell flex={1} strong>{shortId(booking.id)}</Cell>
              <Cell flex={1.1}>{booking.clientName}</Cell>
              <Cell flex={1.1}>{booking.professionalName}</Cell>
              <Cell flex={1.2}>{booking.serviceName}</Cell>
              <Cell flex={0.8} muted>{booking.addressZone}</Cell>
              <Cell flex={1}><Pill {...meta} />
                {[['Accepted', booking.acceptedAt], ['Travel', booking.travelStartedAt], ['Arrived', booking.arrivedAt], ['Started', booking.startedAt], ['Checkout', booking.completedAt]].map(([label, date]) => date ? <Text key={label} style={styles.cellText}>{label}: {new Date(date).toLocaleTimeString()}</Text> : null)}
              </Cell>
              <Cell flex={0.9} muted>{`${booking.dateIso.slice(5, 10)} ${booking.time}`}</Cell>
              <Cell flex={0.9}>
                <Text style={styles.cellStrong}>{`ETB ${money(booking.total)}`}</Text>
                <Text style={styles.cellText}>Paid: {money(booking.paymentSummary?.paidAmount ?? 0)}</Text>
                <Text style={styles.cellText}>Due: {money(booking.paymentSummary?.outstandingAmount ?? booking.total)}</Text>
                {booking.payments?.map((payment) => <Text key={payment.id} style={styles.cellText}>{payment.stage ?? 'full'} · {payment.status} · ETB {money(payment.amount)} · {new Date(payment.updatedAt).toLocaleTimeString()}</Text>)}
              </Cell>
            </View>
          );
        })}
        {!bookings.length ? <Empty>No bookings yet.</Empty> : null}
      </Table>
    </View>
  );
}

function VerificationRow({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: ApiAdminProfessionalApplication;
  busy: boolean;
  onApprove(): void;
  onReject(reason: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { application } = item;
  const documents = item.documents ?? [];
  const portfolioCount = documents.filter((document) => document.kind === 'portfolio').length;
  const idsComplete = ['national_id_front', 'national_id_back', 'government_id']
    .every((kind) => documents.some((document) => document.kind === kind));
  const complete = idsComplete && portfolioCount >= 3;
  const name = application.profile.displayName || application.profile.legalName;

  return (
    <View style={styles.verificationCard}>
      <View style={styles.verificationRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.verificationCopy}>
          <Text style={styles.verificationName}>{name}</Text>
          <Text style={styles.verificationMeta}>
            {application.profile.specialty} · submitted {new Date(application.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {documents.length} documents · {portfolioCount} portfolio photos
          </Text>
          <Text style={styles.verificationToggle}>{expanded ? 'Hide details ↑' : 'Review details ↓'}</Text>
        </Pressable>
        <Pill bg={complete ? c.greenSoft : c.dangerSoft} color={complete ? c.olive : c.danger} label={complete ? 'Complete' : 'Incomplete'} />
        <Pressable disabled={busy} onPress={() => { setRejecting(true); setExpanded(true); }} style={[styles.rejectButton, busy && styles.dimmed]}>
          <Text style={styles.rejectLabel}>Reject</Text>
        </Pressable>
        <Pressable disabled={busy || !complete} onPress={onApprove} style={[styles.approveButton, (busy || !complete) && styles.dimmed]}>
          <Text style={styles.approveLabel}>{busy ? 'Saving…' : 'Approve'}</Text>
        </Pressable>
      </View>
      {rejecting ? (
        <View style={styles.rejectBox}>
          <TextInput
            maxLength={300}
            multiline
            onChangeText={setReason}
            placeholder="Reason sent to the professional by SMS (for example: ID photo is blurry)"
            placeholderTextColor={c.muted}
            style={styles.reasonInput}
            value={reason}
          />
          <View style={styles.rejectActions}>
            <LinkAction label="Cancel" onPress={() => { setRejecting(false); setReason(''); }} />
            <Pressable disabled={busy || reason.trim().length < 5} onPress={() => onReject(reason)} style={[styles.rejectConfirm, (busy || reason.trim().length < 5) && styles.dimmed]}>
              <Text style={styles.approveLabel}>Reject and notify</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {expanded ? <View style={styles.verificationDetails}><AdminApplicationReviewCard hideActions item={item} /></View> : null}
    </View>
  );
}

function VerificationSection({
  data,
  busyId,
  onReview,
}: {
  data: AdminDashboardData;
  busyId: string | null;
  onReview(professionalId: string, action: 'approve' | 'reject', reason?: string): void;
}) {
  const [tab, setTab] = useState<'professionals' | 'clients'>('professionals');
  return (
    <View>
      <PageTitle subtitle="National ID, government ID and portfolio review — pros go live only after approval" title="Professional verification" />
      <View style={styles.filterRow}>
        <FilterChip active={tab === 'professionals'} label={`Professionals (${data.applications.length})`} onPress={() => setTab('professionals')} />
        <FilterChip active={tab === 'clients'} label="Client IDs" onPress={() => setTab('clients')} />
      </View>
      {tab === 'professionals' ? (
        <View style={styles.stack}>
          {data.applications.map((item) => (
            <VerificationRow
              busy={busyId === item.userId}
              item={item}
              key={item.application.id}
              onApprove={() => onReview(item.userId, 'approve')}
              onReject={(reason) => onReview(item.userId, 'reject', reason)}
            />
          ))}
          {!data.applications.length ? <Empty>All caught up — no pending applications.</Empty> : null}
        </View>
      ) : (
        <AdminDocumentReviewSection />
      )}
    </View>
  );
}

function ProfessionalRosterRow({
  item,
  rating,
  reviewCount,
  suspended,
  available,
  busy,
  onSetState,
}: {
  item: ApiAdminProfessionalApplication;
  rating: number;
  reviewCount: number;
  suspended: boolean;
  available: boolean;
  busy: boolean;
  onSetState(action: 'suspend' | 'restore'): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { application } = item;
  const name = application.profile.displayName || application.profile.legalName;
  const portfolioCount = (item.documents ?? []).filter((document) => document.kind === 'portfolio').length;

  return (
    <View style={styles.verificationCard}>
      <View style={styles.verificationRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.verificationCopy}>
          <Text style={styles.verificationName}>{name}</Text>
          <Text style={styles.verificationMeta}>
            {application.profile.specialty} · {application.profile.baseZone} · {item.phoneNumber ? `+${item.phoneNumber.replace(/^\+/, '')}` : 'no phone'} · {reviewCount ? `★ ${rating.toFixed(1)} (${reviewCount})` : 'no reviews yet'} · {portfolioCount} portfolio photos
          </Text>
          <Text style={styles.verificationToggle}>{expanded ? 'Hide details ↑' : 'View details ↓'}</Text>
        </Pressable>
        {!suspended ? (
          <Pill bg={available ? c.greenSoft : c.headerRow} color={available ? c.olive : c.secondary} label={available ? '● Taking bookings' : '○ Paused'} />
        ) : null}
        <Pill bg={suspended ? c.dangerSoft : c.greenSoft} color={suspended ? c.danger : c.olive} label={suspended ? 'Suspended' : 'Active'} />
        {suspended ? (
          <Pressable disabled={busy} onPress={() => onSetState('restore')} style={[styles.approveButton, busy && styles.dimmed]}>
            <Text style={styles.approveLabel}>{busy ? 'Saving…' : 'Restore'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={busy} onPress={() => setConfirming(true)} style={[styles.rejectButton, busy && styles.dimmed]}>
            <Text style={[styles.rejectLabel, { color: c.danger }]}>Suspend</Text>
          </Pressable>
        )}
      </View>
      {confirming && !suspended ? (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>
            Suspending {name} hides them from clients immediately, pauses new bookings and locks their professional app until you restore them.
          </Text>
          <View style={styles.rejectActions}>
            <LinkAction label="Cancel" onPress={() => setConfirming(false)} />
            <Pressable disabled={busy} onPress={() => { setConfirming(false); onSetState('suspend'); }} style={[styles.rejectConfirm, busy && styles.dimmed]}>
              <Text style={styles.approveLabel}>Suspend professional</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {expanded ? <View style={styles.verificationDetails}><AdminApplicationReviewCard hideActions item={item} /></View> : null}
    </View>
  );
}

function ProfessionalsSection({
  data,
  busyId,
  onSetState,
}: {
  data: AdminDashboardData;
  busyId: string | null;
  onSetState(professionalId: string, action: 'suspend' | 'restore'): void;
}) {
  const [filter, setFilter] = useState<'active' | 'suspended'>('active');
  const [query, setQuery] = useState('');
  const stats = new Map(data.professionals.map((professional) => [professional.id, professional]));
  const normalized = query.trim().toLowerCase();
  const roster = data.roster.filter((item) => {
    const suspended = item.application.status === 'suspended';
    if (filter === 'active' ? suspended : !suspended) return false;
    if (!normalized) return true;
    const profile = item.application.profile;
    return [profile.displayName, profile.legalName, profile.specialty, profile.baseZone, item.phoneNumber ?? '']
      .some((value) => value.toLowerCase().includes(normalized));
  });
  const activeCount = data.roster.filter((item) => item.application.status !== 'suspended').length;
  const takingBookings = data.professionals.filter((professional) => professional.approvalStatus === 'active' && professional.available).length;

  return (
    <View>
      <PageTitle subtitle="Approved professionals — review their details and suspend anyone suspicious" title="Professionals" />
      <View style={styles.kpiGrid}>
        <Kpi label="Active professionals" value={activeCount} />
        <Kpi label="Taking bookings now" value={takingBookings} />
        <Kpi label="Paused by professional" value={Math.max(0, activeCount - takingBookings)} />
        <Kpi label="Suspended" tone="danger" value={data.roster.length - activeCount} />
      </View>
      <View style={styles.filterRow}>
        <FilterChip active={filter === 'active'} label={`Active (${activeCount})`} onPress={() => setFilter('active')} />
        <FilterChip active={filter === 'suspended'} label={`Suspended (${data.roster.length - activeCount})`} onPress={() => setFilter('suspended')} />
        <TextInput
          onChangeText={setQuery}
          placeholder="Search name, phone, zone…"
          placeholderTextColor={c.muted}
          style={styles.searchInput}
          value={query}
        />
      </View>
      <View style={styles.stack}>
        {roster.map((item) => {
          const stat = stats.get(item.userId);
          return (
            <ProfessionalRosterRow
              busy={busyId === item.userId}
              item={item}
              key={item.userId}
              onSetState={(action) => onSetState(item.userId, action)}
              rating={stat?.rating ?? 0}
              reviewCount={stat?.reviewCount ?? 0}
              suspended={item.application.status === 'suspended'}
              available={stat?.available === true}
            />
          );
        })}
        {!roster.length ? <Empty>{filter === 'active' ? 'No active professionals match.' : 'No suspended professionals.'}</Empty> : null}
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
      <Text style={[styles.chipText, { color: active ? c.white : c.secondary }]}>{label}</Text>
    </Pressable>
  );
}

function DisputesSection({
  data,
  onRefund,
  onResolve,
}: {
  data: AdminDashboardData;
  onRefund(disputeId: string, bookingId: string): void;
  onResolve(disputeId: string): void;
}) {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const bookings = new Map(data.bookings.map((booking) => [booking.id, booking]));
  const disputes = data.disputes.filter((dispute) => (
    filter === 'all' || (filter === 'open' ? dispute.status === 'open' : dispute.status !== 'open')
  ));
  const columns = [['Booking', 0.9], ['Client', 1], ['Pro', 1], ['Issue', 1.3], ['Amount', 0.8], ['Status', 0.8], ['', 1.2]] as const;

  return (
    <View>
      <PageTitle subtitle="Refunds, no-shows, and service issues" title="Bookings & disputes" />
      <View style={styles.filterRow}>
        {(['open', 'resolved', 'all'] as const).map((value) => (
          <FilterChip active={filter === value} key={value} label={value.charAt(0).toUpperCase() + value.slice(1)} onPress={() => setFilter(value)} />
        ))}
      </View>
      <Table columns={columns}>
        {disputes.map((dispute) => {
          const booking = bookings.get(dispute.bookingId);
          const open = dispute.status === 'open';
          return (
            <View key={dispute.id} style={styles.row}>
              <Cell flex={0.9} strong>{shortId(dispute.bookingId)}</Cell>
              <Cell flex={1}>{booking?.clientName ?? 'Client'}</Cell>
              <Cell flex={1}>{booking?.professionalName ?? 'Professional'}</Cell>
              <Cell flex={1.3}>{dispute.reason}</Cell>
              <Cell flex={0.8}>{booking ? `ETB ${money(booking.total)}` : '—'}</Cell>
              <Cell flex={0.8}>
                {open ? <Pill bg={c.dangerSoft} color={c.danger} label="Open" /> : <Pill bg={c.headerRow} color={c.secondary} label={dispute.status === 'rejected' ? 'Rejected' : 'Resolved'} />}
              </Cell>
              <View style={[styles.actionsCell, { flex: 1.2 }]}>
                {open ? (
                  <>
                    <LinkAction danger label="Refund" onPress={() => onRefund(dispute.id, dispute.bookingId)} />
                    <LinkAction label="Resolve" onPress={() => onResolve(dispute.id)} />
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
        {!disputes.length ? <Empty>No disputes in this view.</Empty> : null}
      </Table>
    </View>
  );
}

function EscrowSection({
  data,
  onQueuePayout,
  onMarkPaid,
}: {
  data: AdminDashboardData;
  onQueuePayout(professionalId: string): void;
  onMarkPaid(payoutId: string, professionalId: string, details: { paidReference: string; paidNote: string }): void;
}) {
  const names = new Map(data.professionals.map((professional) => [professional.id, professional.displayName]));
  const commission = data.bookings
    .filter((booking) => booking.status === 'completed')
    .reduce((sum, booking) => sum + commissionOf(booking), 0);
  const [settling, setSettling] = useState<{ payoutId: string; paidReference: string; paidNote: string } | null>(null);
  const pendingColumns = [['Professional', 1.1], ['Visits', 0.6], ['Owed since', 1], ['Amount', 0.9], ['Pay to', 1.6], ['', 1]] as const;
  const columns = [['Professional', 1.1], ['Visits', 0.6], ['Prepared', 1], ['Amount', 0.9], ['Pay to', 1.6], ['Status', 0.8], ['', 1.2]] as const;

  return (
    <View>
      <PageTitle subtitle="Clients pay Konjo; the team pays professionals by hand to the method they registered and records the reference here" title="Escrow & payouts" />
      <View style={styles.kpiGrid}>
        <Kpi label="Held in escrow" value={`ETB ${money(data.summary.capturedPaymentAmount)}`} />
        <Kpi label="Prepared, unpaid" value={`ETB ${money(data.summary.queuedPayoutAmount)}`} />
        <Kpi label="Commission collected" tone="gold" value={`ETB ${money(commission)}`} />
      </View>

      <Text style={styles.sectionHeading}>Ready to pay</Text>
      <Text style={styles.footnote}>Completed visits not yet grouped into a payout. Prepare a payout, send the money, then mark it paid with the transfer reference. A professional who has not registered a payout account cannot be paid yet; the batch would record no destination.</Text>
      <Table columns={pendingColumns} minWidth={720}>
        {data.pendingPayouts.map((item) => (
          <View key={item.professionalId} style={styles.row}>
            <Cell flex={1.1} strong>{item.displayName}</Cell>
            <Cell flex={0.6} muted>{String(item.bookingCount)}</Cell>
            <Cell flex={1} muted>{new Date(item.oldestEarningAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Cell>
            <Cell flex={0.9} strong>{`ETB ${money(item.amount)}`}</Cell>
            {item.payoutMethod
              ? <Cell flex={1.6} muted>{describePayoutMethod(item.payoutMethod)}</Cell>
              : <View style={{ flex: 1.6 }}><Pill bg={c.dangerSoft} color={c.danger} label="No payout account yet" /></View>}
            <View style={[styles.actionsCell, { flex: 1 }]}>
              <LinkAction disabled={!item.payoutMethod} label={item.payoutMethod ? 'Prepare payout' : 'Waiting for account'} onPress={() => onQueuePayout(item.professionalId)} />
            </View>
          </View>
        ))}
        {!data.pendingPayouts.length ? <Empty>Nobody is owed a payout right now.</Empty> : null}
      </Table>

      <Text style={styles.sectionHeading}>Payout batches</Text>
      <Table columns={columns} minWidth={820}>
        {data.payouts.map((payout) => (
          <View key={payout.id}>
            <View style={styles.row}>
              <Cell flex={1.1} strong>{names.get(payout.professionalId) ?? 'Professional'}</Cell>
              <Cell flex={0.6} muted>{String(payout.bookingCount)}</Cell>
              <Cell flex={1} muted>{new Date(payout.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Cell>
              <Cell flex={0.9} strong>{`ETB ${money(payout.amount)}`}</Cell>
              <Cell flex={1.6} muted>{describePayoutMethod(payout.payoutMethod)}</Cell>
              <Cell flex={0.8}>
                {payout.status === 'queued'
                  ? <Pill bg={c.goldSoft} color={c.goldText} label="To pay" />
                  : payout.status === 'paid'
                    ? <Pill bg={c.headerRow} color={c.secondary} label={payout.paidReference ? `Paid · ${payout.paidReference}` : 'Paid'} />
                    : <Pill bg={c.dangerSoft} color={c.danger} label="Failed" />}
              </Cell>
              <View style={[styles.actionsCell, { flex: 1.2 }]}>
                {payout.status === 'queued' && settling?.payoutId !== payout.id
                  ? <LinkAction label="Mark as paid" onPress={() => setSettling({ payoutId: payout.id, paidReference: '', paidNote: '' })} />
                  : null}
              </View>
            </View>
            {settling?.payoutId === payout.id ? (
              <View style={styles.settleRow}>
                <TextInput
                  accessibilityLabel="Transfer reference"
                  autoFocus
                  onChangeText={(paidReference) => setSettling({ ...settling, paidReference })}
                  placeholder="Transfer reference (e.g. Telebirr transaction id)"
                  placeholderTextColor={c.muted}
                  style={styles.settleInput}
                  value={settling.paidReference}
                />
                <TextInput
                  accessibilityLabel="Note"
                  onChangeText={(paidNote) => setSettling({ ...settling, paidNote })}
                  placeholder="Note (optional)"
                  placeholderTextColor={c.muted}
                  style={styles.settleInput}
                  value={settling.paidNote}
                />
                <LinkAction
                  label="Confirm paid"
                  onPress={() => { onMarkPaid(payout.id, payout.professionalId, { paidReference: settling.paidReference.trim(), paidNote: settling.paidNote.trim() }); setSettling(null); }}
                />
                <LinkAction label="Cancel" onPress={() => setSettling(null)} />
              </View>
            ) : null}
          </View>
        ))}
        {!data.payouts.length ? <Empty>No payout batches yet.</Empty> : null}
      </Table>
    </View>
  );
}

function ZonesSection({
  data,
  onUpdateZone,
  onUpdateCommission,
  onUpdateTravelFeeCap,
}: {
  data: AdminDashboardData;
  onUpdateZone(zone: AdminDashboardData['zones'][number]): void;
  onUpdateCommission(percent: number): void;
  onUpdateTravelFeeCap(travelFeeCap: number): void;
}) {
  const [editingCommission, setEditingCommission] = useState(false);
  const [commission, setCommission] = useState(String(data.settings.commissionRatePercent));
  const [editingTravelFeeCap, setEditingTravelFeeCap] = useState(false);
  const [travelFeeCap, setTravelFeeCap] = useState(String(data.settings.travelFeeCap));
  const columns = [['Zone', 1.2], ['Travel fee', 1], ['Commission', 1], ['Active', 0.8]] as const;

  const saveCommission = () => {
    const percent = Number(commission);
    if (Number.isFinite(percent) && percent >= 0 && percent <= 50) onUpdateCommission(percent);
    setEditingCommission(false);
  };

  const saveTravelFeeCap = () => {
    const cap = Number(travelFeeCap.trim());
    if (Number.isInteger(cap) && cap >= 0 && cap <= 100_000 && cap !== data.settings.travelFeeCap) onUpdateTravelFeeCap(cap);
    else setTravelFeeCap(String(data.settings.travelFeeCap));
    setEditingTravelFeeCap(false);
  };

  return (
    <View>
      <PageTitle subtitle="Travel fees and commission by service zone · click a fee to cycle presets" title="Zones & pricing rules" />
      <View style={styles.settingCard}>
        <View style={styles.settingCopy}>
          <Text style={styles.settingTitle}>Professional travel fee cap</Text>
          <Text style={styles.settingBody}>
            Professionals name their own travel fee when they accept a request. This is the most they can charge, in whole ETB. Changes apply to the next acceptance and are recorded in the audit log.
          </Text>
        </View>
        {editingTravelFeeCap ? (
          <View style={styles.settingInputRow}>
            <Text style={styles.settingUnit}>ETB</Text>
            <TextInput
              accessibilityLabel="Maximum travel fee in ETB"
              autoFocus
              inputMode="numeric"
              onBlur={saveTravelFeeCap}
              onChangeText={setTravelFeeCap}
              onSubmitEditing={saveTravelFeeCap}
              style={styles.settingInput}
              value={travelFeeCap}
            />
          </View>
        ) : (
          <Pressable
            accessibilityHint="Sets the maximum travel fee professionals may charge"
            accessibilityRole="button"
            onPress={() => { setTravelFeeCap(String(data.settings.travelFeeCap)); setEditingTravelFeeCap(true); }}
            style={styles.settingValueButton}>
            <Text style={styles.settingValue}>ETB {money(data.settings.travelFeeCap)}</Text>
            <Text style={styles.settingValueHint}>Click to change</Text>
          </Pressable>
        )}
      </View>
      <Table columns={columns} minWidth={560}>
        {data.zones.map((zone) => {
          const index = feePresets.indexOf(zone.travelFee);
          const nextFee = feePresets[(index + 1) % feePresets.length];
          return (
            <View key={zone.id} style={[styles.row, styles.zoneRow]}>
              <Cell flex={1.2} strong>{zone.label}</Cell>
              <View style={{ flex: 1 }}>
                <Pressable accessibilityRole="button" onPress={() => onUpdateZone({ ...zone, travelFee: nextFee })}>
                  <Text style={styles.feeText}>ETB {money(zone.travelFee)}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                {editingCommission ? (
                  <TextInput
                    autoFocus
                    inputMode="decimal"
                    onBlur={saveCommission}
                    onChangeText={setCommission}
                    onSubmitEditing={saveCommission}
                    style={styles.commissionInput}
                    value={commission}
                  />
                ) : (
                  <Pressable accessibilityHint="Commission applies platform-wide" onPress={() => setEditingCommission(true)}>
                    <Text style={styles.cellText}>{data.settings.commissionRatePercent}%</Text>
                  </Pressable>
                )}
              </View>
              <View style={{ flex: 0.8 }}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: zone.active }}
                  onPress={() => onUpdateZone({ ...zone, active: !zone.active })}
                  style={[styles.toggle, zone.active ? styles.toggleOn : styles.toggleOff]}>
                  <View style={styles.toggleKnob} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </Table>
      <Text style={styles.footnote}>Commission applies to every zone. Click the percentage to change it.</Text>
    </View>
  );
}

function AnalyticsSection({ data }: { data: AdminDashboardData }) {
  const analytics = useMemo(() => {
    const now = new Date();
    const firstWeek = weekStart(new Date(now.getTime() - 5 * 7 * 24 * 60 * 60 * 1000));
    const recent = data.bookings.filter((booking) => (
      booking.status !== 'cancelled' && new Date(`${booking.dateIso.slice(0, 10)}T00:00:00`) >= firstWeek
    ));
    const gmv = recent.reduce((sum, booking) => sum + booking.total, 0);
    const weeks = Array.from({ length: 6 }, (_, index) => {
      const start = new Date(firstWeek.getTime() + index * 7 * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = recent.filter((booking) => {
        const date = new Date(`${booking.dateIso.slice(0, 10)}T00:00:00`);
        return date >= start && date < end;
      }).length;
      return { label: `W${index + 1}`, count };
    });
    const maxWeek = Math.max(1, ...weeks.map((week) => week.count));
    const categories = new Map(data.professionals.map((professional) => [professional.id, professional.category]));
    const share = (key: (booking: ApiAdminBooking) => string, weight: (booking: ApiAdminBooking) => number) => {
      const totals = new Map<string, number>();
      for (const booking of recent) totals.set(key(booking), (totals.get(key(booking)) ?? 0) + weight(booking));
      const sum = [...totals.values()].reduce((total, value) => total + value, 0) || 1;
      return [...totals.entries()]
        .map(([label, value]) => ({ label, pct: Math.round((value / sum) * 100) }))
        .sort((left, right) => right.pct - left.pct);
    };
    const clientCounts = new Map<string, number>();
    for (const booking of recent) clientCounts.set(booking.clientId, (clientCounts.get(booking.clientId) ?? 0) + 1);
    const repeatClients = [...clientCounts.values()].filter((count) => count > 1).length;
    return {
      gmv,
      bookings: recent.length,
      repeatRate: clientCounts.size ? Math.round((repeatClients / clientCounts.size) * 100) : 0,
      weeks: weeks.map((week) => ({ ...week, pct: Math.round((week.count / maxWeek) * 100) })),
      byCategory: share((booking) => categories.get(booking.professionalId) || booking.serviceName, () => 1).slice(0, 5),
      byZone: share((booking) => booking.addressZone || 'Other', (booking) => booking.total).slice(0, 4),
    };
  }, [data]);

  return (
    <View>
      <PageTitle subtitle="Last 6 weeks" title="Platform analytics" />
      <View style={styles.kpiGrid}>
        <Kpi label="GMV (6wk)" value={`ETB ${analytics.gmv >= 1000 ? `${Math.round(analytics.gmv / 1000)}K` : money(analytics.gmv)}`} />
        <Kpi label="Bookings" value={analytics.bookings} />
        <Kpi label="Active pros" value={data.summary.activeProfessionals} />
        <Kpi label="Repeat rate" tone="gold" value={`${analytics.repeatRate}%`} />
      </View>
      <View style={styles.analyticsGrid}>
        <View style={[styles.panel, { flex: 1.4 }]}>
          <Text style={styles.panelTitle}>Weekly bookings</Text>
          <View style={styles.bars}>
            {analytics.weeks.map((week) => (
              <View key={week.label} style={styles.barColumn}>
                <View style={[styles.bar, { height: `${Math.max(week.pct, 2)}%` }]} />
                <Text style={styles.barLabel}>{week.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.panel, { flex: 1 }]}>
          <Text style={styles.panelTitle}>By category</Text>
          <View style={styles.stackTight}>
            {analytics.byCategory.map((item) => <Meter color={c.olive} key={item.label} label={item.label} pct={item.pct} />)}
            {!analytics.byCategory.length ? <Text style={styles.cellMuted}>No bookings yet.</Text> : null}
          </View>
        </View>
      </View>
      <View style={[styles.panel, { marginTop: 16 }]}>
        <Text style={styles.panelTitle}>Top zones by GMV</Text>
        <View style={styles.zoneMeters}>
          {analytics.byZone.map((item) => <View key={item.label} style={{ flex: 1, minWidth: 140 }}><Meter color={c.gold} label={item.label} pct={item.pct} /></View>)}
          {!analytics.byZone.length ? <Text style={styles.cellMuted}>No bookings yet.</Text> : null}
        </View>
      </View>
    </View>
  );
}

function Meter({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View>
      <View style={styles.meterLabels}><Text style={styles.meterText}>{label}</Text><Text style={styles.meterText}>{pct}%</Text></View>
      <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
const navItems: readonly { id: Section; label: string }[] = [
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'verification', label: 'Verification' },
  { id: 'professionals', label: 'Professionals' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'escrow', label: 'Escrow' },
  { id: 'zones', label: 'Zones & pricing' },
  { id: 'analytics', label: 'Analytics' },
];

export function AdminDashboardScreen() {
  const { session, signOut } = useAuthSession();
  const [section, setSection] = useState<Section>('dispatch');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessToken = session?.accessToken;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const dashboard = await adminService.loadDashboard(accessToken);
      setData(dashboard);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The operations data could not be loaded.');
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const interval = setInterval(() => { void refresh(); }, 10_000);
    const bookings = liveUpdatesGateway.subscribe('bookings', 'id', null, () => { void refresh(); });
    const payments = liveUpdatesGateway.subscribe('payment_intents', 'id', null, () => { void refresh(); });
    const payouts = liveUpdatesGateway.subscribe('payout_batches', 'id', null, () => { void refresh(); });
    const earnings = liveUpdatesGateway.subscribe('professional_earnings', 'id', null, () => { void refresh(); });
    return () => { clearInterval(interval); bookings(); payments(); payouts(); earnings(); };
  }, [refresh]);

  const run = async (id: string, action: () => Promise<unknown>, message: string) => {
    if (!accessToken || busyId) return;
    setBusyId(id);
    try {
      await action();
      showToast(message);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.');
    } finally {
      setBusyId(null);
    }
  };

  const token = accessToken ?? '';
  const applicationName = (professionalId: string) => (
    data?.applications.find((item) => item.userId === professionalId)?.application.profile.displayName ?? 'Professional'
  );
  const openDisputes = data?.disputes.filter((dispute) => dispute.status === 'open').length ?? 0;

  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <View style={styles.brand}>
          <Text style={styles.brandName}>konjo<Text style={{ color: c.gold }}>.</Text></Text>
          <Text style={styles.brandTag}>ADMIN</Text>
        </View>
        <View style={styles.nav}>
          {navItems.map((item) => {
            const active = section === item.id;
            const count = item.id === 'verification' ? data?.applications.length : item.id === 'disputes' ? openDisputes : undefined;
            return (
              <Pressable accessibilityRole="button" key={item.id} onPress={() => setSection(item.id)} style={[styles.navItem, active && styles.navItemActive]}>
                <NavIcon color={active ? c.white : 'rgba(255,255,255,0.55)'} section={item.id} />
                <Text style={[styles.navLabel, active && { color: c.white }]}>{item.label}</Text>
                {count !== undefined ? (
                  <View style={[
                    styles.navBadge,
                    active && item.id === 'verification' && { backgroundColor: c.gold },
                    active && item.id === 'disputes' && { backgroundColor: c.danger },
                  ]}>
                    <Text style={[styles.navBadgeText, active && { color: item.id === 'disputes' ? c.white : c.sidebar }]}>{count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.sidebarFooter}>
          <Text numberOfLines={1} style={styles.signedIn}>Signed in as {session?.displayName || session?.email || 'administrator'}</Text>
          <Pressable accessibilityRole="button" onPress={signOut}><Text style={styles.signOut}>Sign out</Text></Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content} style={styles.main}>
        {error ? (
          <Pressable accessibilityRole="alert" onPress={() => setError(null)} style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}
        {!data ? <Text style={styles.loading}>Loading operations data…</Text> : (
          <>
            {section === 'dispatch' ? (
              <DispatchSection
                data={data}
                onResolveIncident={(id) => { void run(id, () => adminService.resolveSafetyIncident(id, 'Handled by Konjo operations.', token), 'SOS alert marked as handled'); }}
              />
            ) : null}
            {section === 'verification' ? (
              <VerificationSection
                busyId={busyId}
                data={data}
                onReview={(professionalId, action, reason) => {
                  const name = applicationName(professionalId);
                  void run(
                    professionalId,
                    () => adminService.reviewApplication(professionalId, action, token, reason),
                    action === 'approve' ? `${name} approved and live on Konjo` : `${name} application rejected`,
                  );
                }}
              />
            ) : null}
            {section === 'professionals' ? (
              <ProfessionalsSection
                busyId={busyId}
                data={data}
                onSetState={(professionalId, action) => {
                  const name = data.roster.find((item) => item.userId === professionalId)?.application.profile.displayName ?? 'Professional';
                  void run(
                    professionalId,
                    () => adminService.setProfessionalState(professionalId, action, token),
                    action === 'suspend' ? `${name} suspended and hidden from clients` : `${name} restored and live again`,
                  );
                }}
              />
            ) : null}
            {section === 'disputes' ? (
              <DisputesSection
                data={data}
                onRefund={(disputeId, bookingId) => {
                  void run(disputeId, async () => {
                    await adminService.refundBooking(bookingId, token);
                    await adminService.resolveDispute(disputeId, 'resolved', 'Refunded to the client by Konjo operations.', token);
                  }, 'Refund issued and dispute resolved');
                }}
                onResolve={(disputeId) => { void run(disputeId, () => adminService.resolveDispute(disputeId, 'resolved', 'Resolved by Konjo operations.', token), 'Dispute marked resolved'); }}
              />
            ) : null}
            {section === 'escrow' ? (
              <EscrowSection
                data={data}
                onMarkPaid={(payoutId, professionalId, details) => { void run(payoutId, () => adminService.markPayoutPaid(payoutId, professionalId, token, details), details.paidReference ? `Payout marked paid · ${details.paidReference}` : 'Payout marked as paid'); }}
                onQueuePayout={(professionalId) => { void run(`queue:${professionalId}`, () => adminService.queuePayout(professionalId, token), 'Payout prepared. Send the money, then mark it paid.'); }}
              />
            ) : null}
            {section === 'zones' ? (
              <ZonesSection
                data={data}
                onUpdateCommission={(percent) => { void run('commission', () => adminService.updateCommissionRate(Math.round(percent * 100), token), `Commission set to ${percent}%`); }}
                onUpdateTravelFeeCap={(travelFeeCap) => { void run('travel-fee-cap', () => adminService.updateTravelFeeCap(travelFeeCap, token), `Travel fee cap set to ETB ${money(travelFeeCap)}`); }}
                onUpdateZone={(zone) => { void run(zone.id, () => adminService.updateZone(zone, token), `${zone.label} updated`); }}
              />
            ) : null}
            {section === 'analytics' ? <AnalyticsSection data={data} /> : null}
          </>
        )}
      </KeyboardAwareScrollView>

      {toast ? <View pointerEvents="none" style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: c.canvas, minHeight: '100%' },
  sidebar: { width: 224, flexShrink: 0, backgroundColor: c.sidebar, paddingVertical: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingBottom: 26 },
  brandName: { color: c.white, fontFamily: 'BodoniModa_400Regular', fontSize: 19 },
  brandTag: { color: 'rgba(255,255,255,0.5)', fontFamily: bodySemibold, fontSize: 10, letterSpacing: 0.6 },
  nav: { gap: 2, paddingHorizontal: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 8 },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  navLabel: { flex: 1, color: 'rgba(255,255,255,0.65)', fontFamily: bodySemibold, fontSize: 13 },
  navBadge: { borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 7, paddingVertical: 2 },
  navBadgeText: { color: 'rgba(255,255,255,0.6)', fontFamily: bodyBold, fontSize: 10 },
  sidebarFooter: { paddingHorizontal: 22, gap: 6 },
  signedIn: { color: 'rgba(255,255,255,0.4)', fontFamily: body, fontSize: 11 },
  signOut: { color: 'rgba(255,255,255,0.65)', fontFamily: bodySemibold, fontSize: 11 },
  main: { flex: 1 },
  content: { paddingVertical: 30, paddingHorizontal: 36, paddingBottom: 80 },
  pageTitle: { color: c.text, fontFamily: display, fontSize: 24 },
  pageSubtitle: { color: c.secondary, fontFamily: body, fontSize: 13, marginTop: 4 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 22 },
  kpi: { flex: 1, minWidth: 170, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 16 },
  kpiLabel: { color: c.muted, fontFamily: body, fontSize: 11, textTransform: 'uppercase' },
  kpiValue: { color: c.text, fontFamily: display, fontSize: 24, marginTop: 6 },
  tableCard: { marginTop: 24, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: c.headerRow },
  zoneRow: { paddingVertical: 14 },
  headerRow: { backgroundColor: c.headerRow, paddingVertical: 12, borderTopWidth: 0 },
  headerCell: { color: c.muted, fontFamily: bodyBold, fontSize: 10.5, textTransform: 'uppercase' },
  cellText: { color: c.text, fontFamily: body, fontSize: 13 },
  cellStrong: { fontFamily: bodySemibold },
  cellMuted: { color: c.secondary, fontFamily: body, fontSize: 13 },
  pill: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: bodyBold, fontSize: 11 },
  actionsCell: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  linkAction: { color: c.olive, fontFamily: bodyBold, fontSize: 12 },
  empty: { color: c.muted, fontFamily: body, fontSize: 13, textAlign: 'center', padding: 40 },
  alert: { marginTop: 18, borderRadius: 10, backgroundColor: c.dangerSoft, padding: 14, gap: 8 },
  alertTitle: { color: c.danger, fontFamily: bodyBold, fontSize: 13 },
  alertRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  alertText: { color: c.text, fontFamily: body, fontSize: 12, textTransform: 'capitalize' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: { borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  chipActive: { backgroundColor: c.sidebar },
  chipIdle: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  chipText: { fontFamily: bodySemibold, fontSize: 12.5 },
  stack: { gap: 12, marginTop: 22 },
  stackTight: { gap: 10 },
  verificationCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 16 },
  verificationRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.olive, fontFamily: display, fontSize: 16 },
  verificationCopy: { flex: 1, minWidth: 220 },
  verificationName: { color: c.text, fontFamily: bodySemibold, fontSize: 14.5 },
  verificationMeta: { color: c.secondary, fontFamily: body, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  verificationToggle: { color: c.olive, fontFamily: bodySemibold, fontSize: 11.5, marginTop: 4 },
  verificationDetails: { marginTop: 14 },
  rejectButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  rejectLabel: { color: c.text, fontFamily: bodySemibold, fontSize: 13 },
  approveButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: c.sage },
  approveLabel: { color: c.white, fontFamily: bodySemibold, fontSize: 13 },
  rejectBox: { marginTop: 14, gap: 10 },
  reasonInput: { minHeight: 70, borderWidth: 1, borderColor: c.border, borderRadius: 8, color: c.text, fontFamily: body, fontSize: 13, padding: 12, textAlignVertical: 'top' },
  rejectActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
  confirmBox: { marginTop: 14, gap: 10, borderRadius: 8, backgroundColor: '#FFF4F2', padding: 12 },
  confirmText: { color: c.text, fontFamily: body, fontSize: 13, lineHeight: 19 },
  searchInput: { flex: 1, minWidth: 200, borderWidth: 1, borderColor: c.border, borderRadius: 100, backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 8, color: c.text, fontFamily: body, fontSize: 12.5 },
  rejectConfirm: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: c.danger },
  dimmed: { opacity: 0.45 },
  feeText: { color: c.olive, fontFamily: bodySemibold, fontSize: 13.5 },
  sectionHeading: { color: c.text, fontFamily: bodySemibold, fontSize: 14, marginTop: 18, marginBottom: 6 },
  settleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.headerRow },
  settleInput: { minWidth: 220, flexGrow: 1, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, color: c.text, fontFamily: body, fontSize: 13, backgroundColor: c.surface },
  settingCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 },
  settingCopy: { flex: 1, minWidth: 240 },
  settingTitle: { color: c.text, fontFamily: bodySemibold, fontSize: 13.5 },
  settingBody: { color: c.muted, fontFamily: body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  settingInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingUnit: { color: c.muted, fontFamily: body, fontSize: 12 },
  settingInput: { width: 96, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: c.text, fontFamily: bodySemibold, fontSize: 13, textAlign: 'right' },
  settingValueButton: { alignItems: 'flex-end' },
  settingValue: { color: c.olive, fontFamily: bodySemibold, fontSize: 15 },
  settingValueHint: { color: c.muted, fontFamily: body, fontSize: 11, marginTop: 2 },
  commissionInput: { width: 70, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, color: c.text, fontFamily: body, fontSize: 13 },
  toggle: { width: 38, height: 22, borderRadius: 100, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: c.sage, alignItems: 'flex-end' },
  toggleOff: { backgroundColor: c.border, alignItems: 'flex-start' },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.white },
  footnote: { color: c.muted, fontFamily: body, fontSize: 12, marginTop: 10 },
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 20 },
  panel: { minWidth: 280, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 20 },
  panelTitle: { color: c.text, fontFamily: bodySemibold, fontSize: 13, marginBottom: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, height: 140 },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  bar: { width: '100%', backgroundColor: c.sage, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { color: c.muted, fontFamily: body, fontSize: 11 },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  meterText: { color: c.secondary, fontFamily: body, fontSize: 12, textTransform: 'capitalize' },
  meterTrack: { height: 6, borderRadius: 100, backgroundColor: c.headerRow },
  meterFill: { height: 6, borderRadius: 100 },
  zoneMeters: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  errorBanner: { borderRadius: 10, backgroundColor: c.dangerSoft, padding: 14, marginBottom: 18 },
  errorText: { color: c.danger, fontFamily: body, fontSize: 13 },
  loading: { color: c.secondary, fontFamily: body, fontSize: 14 },
  toast: { position: 'absolute', alignSelf: 'center', left: '50%', bottom: 30, transform: [{ translateX: -160 }], width: 320, backgroundColor: c.sidebar, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 22, shadowColor: c.sidebar, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 12 } },
  toastText: { color: c.white, fontFamily: bodySemibold, fontSize: 13.5, textAlign: 'center' },
});
