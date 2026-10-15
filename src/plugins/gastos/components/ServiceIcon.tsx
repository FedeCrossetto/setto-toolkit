import {
  Flame, Zap, Droplets, Wifi, Landmark, Receipt, Tv, Radio, Smartphone, Globe, Building2, Car, ShieldCheck,
  Dumbbell, BookOpen, CreditCard, Wrench, Utensils, Music, type LucideIcon,
} from 'lucide-react'

export const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame, zap: Zap, droplets: Droplets, wifi: Wifi,
  landmark: Landmark, receipt: Receipt, tv: Tv, radio: Radio,
  smartphone: Smartphone, globe: Globe, building2: Building2,
  car: Car, shield: ShieldCheck, dumbbell: Dumbbell, book: BookOpen,
  card: CreditCard, wrench: Wrench, food: Utensils, music: Music,
}
export const ICON_OPTIONS = Object.keys(SERVICE_ICON_MAP)

export function ServiceIcon({ icon, size = 15, className }: { icon: string; size?: number; className?: string }): JSX.Element {
  const Icon = SERVICE_ICON_MAP[icon]
  if (Icon) return <Icon size={size} className={className} />
  return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>
}

/** Ícono en un cuadradito neutro (listas). */
export function ServiceTile({ icon, size = 13 }: { icon: string; size?: number }): JSX.Element {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-on-surface/6 text-on-surface-variant">
      <ServiceIcon icon={icon} size={size} />
    </span>
  )
}
