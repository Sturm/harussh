// Host icons: a gallery of presets (line symbols + OS/app logos), custom images
// the user added, and automatic picking from the username and host name.
import * as si from 'simple-icons'
import type { CustomIcon } from '../../shared/types'
import { iconPaths } from './icons'

export interface IconPreset {
  id: string
  label: string
  kind: 'symbol' | 'logo'
  // Inner SVG markup for a 24×24 viewBox: stroked for symbols, filled for logos.
  svg: string
  // Fixed background; without it the host's own color is used.
  color?: string
}

const ADMIN_GREEN = '#17803d'

const symbols: IconPreset[] = [
  {
    id: 'admin',
    label: 'Admin (root)',
    svg: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    color: ADMIN_GREEN
  },
  { id: 'server', label: 'Server', svg: iconPaths.server },
  { id: 'terminal', label: 'Terminal', svg: iconPaths.terminal },
  {
    id: 'database',
    label: 'Database',
    svg: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'
  },
  {
    id: 'cloud',
    label: 'Cloud / VPS',
    svg: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18Z"/>'
  },
  {
    id: 'web',
    label: 'Web',
    svg: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z"/>'
  },
  {
    id: 'network',
    label: 'Router / network',
    svg: '<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 17h.01M11 17h.01M12 14V9M8.5 7.5a5 5 0 0 1 7 0M6 5a8.5 8.5 0 0 1 12 0"/>'
  },
  {
    id: 'firewall',
    label: 'Firewall',
    svg: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M7 9.7v4.6M12 9.7v4.6M17 9.7v4.6M9 14.3V19M15 14.3V19"/>'
  },
  {
    id: 'storage',
    label: 'Storage / backup',
    svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 13h18M7 16h.01M11 16h.01"/>'
  },
  { id: 'container', label: 'Container', svg: '<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/>' },
  {
    id: 'lab',
    label: 'Dev / test',
    svg: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/>'
  },
  { id: 'home', label: 'Home', svg: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/>' },
  { id: 'bolt', label: 'Fast / important', svg: '<path d="M13 3 5 14h6l-1 7 8-11h-6Z"/>' },
  { id: 'user', label: 'User', svg: iconPaths.user }
].map((p) => ({ ...p, kind: 'symbol' as const }))

const logoIcons: [string, si.SimpleIcon][] = [
  ['ubuntu', si.siUbuntu],
  ['debian', si.siDebian],
  ['fedora', si.siFedora],
  ['centos', si.siCentos],
  ['redhat', si.siRedhat],
  ['archlinux', si.siArchlinux],
  ['alpine', si.siAlpinelinux],
  ['raspberrypi', si.siRaspberrypi],
  ['opensuse', si.siOpensuse],
  ['almalinux', si.siAlmalinux],
  ['rockylinux', si.siRockylinux],
  ['kali', si.siKalilinux],
  ['mint', si.siLinuxmint],
  ['nixos', si.siNixos],
  ['freebsd', si.siFreebsd],
  ['linux', si.siLinux],
  ['apple', si.siApple],
  ['docker', si.siDocker],
  ['kubernetes', si.siKubernetes],
  ['proxmox', si.siProxmox],
  ['truenas', si.siTruenas],
  ['homeassistant', si.siHomeassistant],
  ['openwrt', si.siOpenwrt],
  ['pfsense', si.siPfsense],
  ['nginx', si.siNginx],
  ['postgresql', si.siPostgresql],
  ['mysql', si.siMysql],
  ['redis', si.siRedis],
  ['mongodb', si.siMongodb],
  ['git', si.siGit],
  ['gitlab', si.siGitlab],
  ['jenkins', si.siJenkins],
  ['googlecloud', si.siGooglecloud],
  ['digitalocean', si.siDigitalocean],
  ['hetzner', si.siHetzner],
  ['ovh', si.siOvh],
  ['vultr', si.siVultr],
  ['cloudflare', si.siCloudflare]
]

const logos: IconPreset[] = logoIcons.map(([id, icon]) => ({
  id,
  label: icon.title,
  kind: 'logo',
  svg: `<path d="${icon.path}"/>`,
  // Pure black brand colors disappear on dark themes.
  color: icon.hex === '000000' ? '#2a2e36' : `#${icon.hex}`
}))

export const iconPresets = { symbols, logos }
const presetById = new Map([...symbols, ...logos].map((p) => [p.id, p]))

// --- automatic picking ---

const byUsername: Record<string, string> = {
  root: 'admin',
  toor: 'admin',
  admin: 'admin',
  administrator: 'admin',
  ubuntu: 'ubuntu',
  debian: 'debian',
  fedora: 'fedora',
  centos: 'centos',
  rocky: 'rockylinux',
  almalinux: 'almalinux',
  alpine: 'alpine',
  arch: 'archlinux',
  pi: 'raspberrypi',
  kali: 'kali',
  nixos: 'nixos',
  freebsd: 'freebsd',
  git: 'git',
  gitlab: 'gitlab',
  postgres: 'postgresql',
  mysql: 'mysql',
  docker: 'docker',
  'ec2-user': 'cloud',
  opc: 'cloud'
}

// Keywords looked up in the label and host name, as whole words ("pve-2" and
// "rhel9" match, "graphite" does not match "pi").
const byName: [string, string[]][] = [
  ['ubuntu', ['ubuntu']],
  ['debian', ['debian']],
  ['fedora', ['fedora']],
  ['centos', ['centos']],
  ['redhat', ['rhel', 'redhat']],
  ['archlinux', ['arch', 'archlinux']],
  ['alpine', ['alpine']],
  ['raspberrypi', ['raspberry', 'raspberrypi', 'raspi', 'rpi', 'pi']],
  ['opensuse', ['suse', 'opensuse', 'sles']],
  ['almalinux', ['alma', 'almalinux']],
  ['rockylinux', ['rocky']],
  ['kali', ['kali']],
  ['mint', ['mint']],
  ['nixos', ['nixos', 'nix']],
  ['freebsd', ['freebsd', 'bsd']],
  ['apple', ['mac', 'macos', 'macbook', 'imac', 'macmini']],
  ['docker', ['docker']],
  ['kubernetes', ['k8s', 'k3s', 'kube', 'kubernetes']],
  ['proxmox', ['proxmox', 'pve']],
  ['truenas', ['truenas', 'freenas', 'nas']],
  ['homeassistant', ['homeassistant', 'hass']],
  ['openwrt', ['openwrt']],
  ['pfsense', ['pfsense']],
  ['nginx', ['nginx']],
  ['postgresql', ['postgres', 'postgresql', 'pg', 'psql']],
  ['mysql', ['mysql', 'mariadb']],
  ['redis', ['redis']],
  ['mongodb', ['mongo', 'mongodb']],
  ['gitlab', ['gitlab']],
  ['git', ['git', 'gitea', 'forgejo']],
  ['jenkins', ['jenkins']],
  ['googlecloud', ['gcp', 'gce']],
  ['digitalocean', ['digitalocean', 'droplet']],
  ['hetzner', ['hetzner', 'hcloud']],
  ['ovh', ['ovh']],
  ['vultr', ['vultr']],
  ['database', ['db', 'database', 'sql']],
  ['firewall', ['fw', 'firewall']],
  ['network', ['router', 'gw', 'gateway', 'switch']],
  ['storage', ['storage', 'backup', 'minio', 's3']],
  ['container', ['container', 'lxc', 'ct']],
  ['web', ['web', 'www', 'site', 'frontend']],
  ['lab', ['dev', 'test', 'staging', 'stage', 'qa', 'sandbox', 'lab']],
  ['home', ['home', 'homelab']],
  ['cloud', ['cloud', 'vps', 'ec2', 'aws', 'azure']]
]
const nameRules = byName.map(
  ([id, words]) => [id, new RegExp(`(?:^|[^a-z])(?:${words.join('|')})(?:[^a-z]|$)`)] as const
)

export interface IconSource {
  icon: string
  color: string
  label: string
  hostname: string
  username: string
}

/** The preset an "Auto" icon resolves to, or null for initials. */
function autoPresetId(h: Omit<IconSource, 'icon' | 'color'>): string | null {
  const user = byUsername[h.username.trim().toLowerCase()]
  if (user) return user
  const names = `${h.label} ${h.hostname}`.toLowerCase()
  for (const [id, re] of nameRules) if (re.test(names)) return id
  return null
}

/** Two letters from the label or host name; null when it has none (e.g. an IP). */
function initials(h: IconSource): string | null {
  const words = (h.label || h.hostname).split(/[^\p{L}\p{N}]+/u).filter((w) => /\p{L}/u.test(w))
  if (!words.length) return null
  const text = words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)
  return text.toUpperCase()
}

export type ResolvedIcon =
  | { kind: 'preset'; preset: IconPreset; bg: string; fg: string }
  | { kind: 'image'; src: string; bg: string }
  | { kind: 'text'; text: string; bg: string; fg: string }

function textColor(bg: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg)
  if (!m) return '#fff'
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1b1d23' : '#fff'
}

function fromPreset(preset: IconPreset, h: IconSource): ResolvedIcon {
  const bg = preset.color ?? h.color
  return { kind: 'preset', preset, bg, fg: textColor(bg) }
}

export function resolveHostIcon(h: IconSource, custom: CustomIcon[]): ResolvedIcon {
  if (h.icon.startsWith('custom:')) {
    const img = custom.find((c) => `custom:${c.id}` === h.icon)
    if (img) return { kind: 'image', src: img.data, bg: h.color }
  }
  const preset = presetById.get(h.icon) ?? presetById.get(autoPresetId(h) ?? '')
  if (preset) return fromPreset(preset, h)
  const text = initials(h)
  if (text) return { kind: 'text', text, bg: h.color, fg: textColor(h.color) }
  return fromPreset(presetById.get('server')!, h)
}

/** Reads an image file and turns it into a 128×128 PNG data URL (center-cropped). */
export async function imageFileToIcon(file: File): Promise<string> {
  // A data: URL, not a blob: one: the packaged app's CSP only allows data: images.
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch {
    throw new Error('That file is not an image harussh can read.')
  }
  const size = 128
  const w = img.naturalWidth || size
  const h = img.naturalHeight || size
  const scale = Math.max(size / w, size / h)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale)
  return canvas.toDataURL('image/png')
}
