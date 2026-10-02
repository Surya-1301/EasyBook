export const CLINIC_ID: string = (() => {
  const id = (import.meta.env.VITE_CLINIC_ID as string | undefined)?.trim();
  if (!id) {
    throw new Error(
      'VITE_CLINIC_ID is not set. Copy frontend/.env.example to frontend/.env and set VITE_CLINIC_ID to your clinic id.'
    );
  }
  return id;
})();
