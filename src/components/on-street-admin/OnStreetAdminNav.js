import Link from "next/link";
const items=[["/on-street-qr","Dashboard"],["/on-street-qr/sesiones","Sesiones"],["/on-street-qr/pagos","Pagos"],["/on-street-qr/ubicaciones","Ubicaciones QR"]];
export default function OnStreetAdminNav(){return <nav className="flex flex-wrap gap-2" aria-label="On Street QR">{items.map(([href,label])=><Link key={href} href={href} className="rounded-full border border-[var(--pf-color-onstreet-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:bg-[var(--pf-color-onstreet-tint)]">{label}</Link>)}</nav>}
