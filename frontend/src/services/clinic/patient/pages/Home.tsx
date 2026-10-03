import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { Appointment, LocalBusiness } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { useAuth } from '../../../../auth/AuthContext';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Modal } from '../../../../components/Modal';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { IconCalendarPlus, IconClock, IconMapPin, IconNavigation, IconScissors, IconShoppingBag, IconStethoscope, IconUsers } from '../../../../components/icons';
import { formatDateTime, initials } from '../../../../utils/format';


type SavedLocation = { label: string; latitude?: number; longitude?: number };
const LOCATION_KEY = 'easybook.location';

function readSavedLocation(): SavedLocation | null {
  try {
    const saved = window.localStorage.getItem(LOCATION_KEY);
    return saved ? (JSON.parse(saved) as SavedLocation) : null;
  } catch {
    return null;
  }
}

function businessIcon(type: LocalBusiness['type']) {
  return type === 'clinic' ? IconStethoscope : type === 'barber' ? IconScissors : IconShoppingBag;
}

function QuickAction({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700"
        aria-hidden
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-bold text-slate-900">{label}</span>
      <span className="text-[11px] leading-tight text-slate-500">{sub}</span>
    </button>
  );
}

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [location, setLocation] = useState<SavedLocation | null>(() => readSavedLocation());
  const [nearby, setNearby] = useState<LocalBusiness[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apptRes = await Promise.allSettled([api.appointments.list('upcoming')]);
      if (cancelled) return;
      if (apptRes[0].status === 'fulfilled') setUpcoming(apptRes[0].value.appointments);
      if (apptRes[0].status === 'rejected') {
        const err = apptRes[0].reason;
        toast.error(err instanceof ApiError ? err.message : 'Could not load the home screen.');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    api.directory
      .nearby({ latitude: location.latitude, longitude: location.longitude, text: location.latitude === undefined ? location.label : undefined })
      .then((res) => {
        if (!cancelled) setNearby(res.businesses);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not find nearby businesses.');
      });
    return () => {
      cancelled = true;
    };
  }, [location, toast]);

  const nextVisit = useMemo(
    () => upcoming.find((a) => ['BOOKED', 'CONFIRMED'].includes(a.status)),
    [upcoming],
  );

  async function checkIn() {
    if (!nextVisit) return;
    setCheckingIn(true);
    try {
      const res = await api.appointments.checkIn(nextVisit.id);
      toast.success(`Checked in! Your token is #${res.queueTicket.tokenNumber}`);
      navigate(`/queue/${nextVisit.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  }

  function saveLocation(next: SavedLocation) {
    window.localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
    setLocation(next);
    setLocationOpen(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Your browser does not support location access.');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        saveLocation({ label: 'Current location', latitude: coords.latitude, longitude: coords.longitude });
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        toast.error('Location access was unavailable. Enter your area manually instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }

  const firstName = (user?.name || 'there').split(' ')[0];

  if (loading) return <LoadingState message="Loading…" />;

  return (
    <div className="pb-2">
      {/* Greeting header */}
      <div className="rounded-b-[2rem] bg-gradient-to-br from-brand-600 via-brand-500 to-teal-500 px-5 pb-8 pt-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-teal-50/90">Good day,</p>
            <h1 className="truncate text-2xl font-extrabold">{firstName}</h1>
            <button type="button" onClick={() => setLocationOpen(true)} className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-left text-sm font-semibold text-white/95 hover:text-white">
              <IconMapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{location?.label || 'Choose your location'}</span>
            </button>
          </div>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold backdrop-blur"
            aria-hidden
          >
            {initials(user?.name || firstName)}
          </div>
        </div>
      </div>

      <div className="-mt-2 px-4">
        {location && (
          <section aria-label="Nearby businesses" className="mt-6">
            <div className="flex items-center justify-between px-1"><div><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Around you</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">Nearby businesses</h2></div><span className="text-xs font-semibold text-slate-400">Within 10 km</span></div>
            <div className="mt-3 space-y-3">
              {nearby.length === 0 ? <EmptyState title="No businesses found nearby yet." /> : nearby.map((business) => { const Icon = businessIcon(business.type); return <button key={business.id} type="button" onClick={() => business.type === 'clinic' ? navigate(`/clinics/${encodeURIComponent(business.id)}/doctors`) : navigate(`/workspace/${business.type}`)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:shadow"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-900">{business.name}</span><span className="mt-1 block truncate text-sm text-slate-500">{business.description || business.address}</span></span><span className="shrink-0 text-right"><span className="block text-sm font-bold text-slate-700">{business.rating ? `★ ${business.rating}` : ''}</span><span className="mt-1 block text-xs text-slate-400">{business.distanceKm != null ? `${business.distanceKm} km` : business.city}</span></span></button>; })}
            </div>
          </section>
        )}

        {/* Upcoming visit */}
        {nextVisit && (
          <section aria-label="Upcoming visit" className="mt-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Upcoming visit
            </p>
            <div className="mt-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 bg-brand-50 px-5 py-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
                  aria-hidden
                >
                  {initials(nextVisit.doctor.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold text-slate-900">
                    {nextVisit.doctor.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">{nextVisit.doctor.specialty}</p>
                </div>
                {nextVisit.tokenNumber != null && (
                  <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-sm font-bold text-white">
                    #{nextVisit.tokenNumber}
                  </span>
                )}
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">
                  {formatDateTime(nextVisit.startAt)}
                </p>
                <p className="text-sm text-slate-500">For {nextVisit.patient.fullName}</p>
                <div className="mt-3 flex gap-2">
                  {nextVisit.queueTicket ? (
                    <Button className="flex-1" onClick={() => navigate(`/queue/${nextVisit.id}`)}>
                      View queue
                    </Button>
                  ) : (
                    <>
                      <Button className="flex-1" loading={checkingIn} onClick={checkIn}>
                        Check in
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => navigate(`/appointments/${nextVisit.id}`)}
                      >
                        Details
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section aria-label="Quick actions" className="mt-6">
          <div className="grid grid-cols-3 gap-3">
            <QuickAction icon={IconCalendarPlus} label="Book visit" sub="Find a doctor" onClick={() => navigate('/doctors')} />
            <QuickAction icon={IconUsers} label="Family" sub="Members" onClick={() => navigate('/profile')} />
            <QuickAction
              icon={IconClock}
              label="My queue"
              sub="Live status"
              onClick={() =>
                nextVisit?.queueTicket ? navigate(`/queue/${nextVisit.id}`) : navigate('/appointments')
              }
            />
          </div>
        </section>

      </div>

      <Modal open={locationOpen} onClose={() => setLocationOpen(false)} title="Choose your location">
        <p className="text-sm leading-6 text-slate-500">Use your current location for the most accurate nearby results, or search by your area or city.</p>
        <Button className="mt-5 w-full" loading={locationLoading} onClick={useCurrentLocation}><IconNavigation className="h-4 w-4" />Use current location</Button>
        <div className="my-5 flex items-center gap-3 text-xs font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div>
        <label className="block text-sm font-semibold text-slate-700">Area or city<input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="e.g. Local City" className="input-field mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 font-normal text-slate-900 placeholder:text-slate-400" /></label>
        <Button className="mt-4 w-full" disabled={locationText.trim().length < 2} onClick={() => saveLocation({ label: locationText.trim() })}>Show nearby businesses</Button>
      </Modal>
    </div>
  );
}
