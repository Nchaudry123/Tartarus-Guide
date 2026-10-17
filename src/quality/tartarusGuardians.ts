/**
 * Tartarus guardian affinities, recommended levels and floors, generated from Game8's
 * "Tartarus Guardians: List of All Mini-Bosses" table in the indexed data
 * (https://game8.co/games/Persona-3-Reload/archives/440374). Normal and unknown affinities
 * are omitted. Regenerate rather than hand-edit.
 */

export type Affinity = "Weak" | "Resist" | "Null" | "Drain" | "Repel";
export type AttackType = "slash" | "strike" | "pierce" | "fire" | "ice" | "electric" | "wind" | "light" | "dark";

export type TartarusGuardian = { name: string; level: number; floor: number; affinities: Partial<Record<AttackType, Affinity>> };

export const TARTARUS_GUARDIAN_SOURCE = {
  title: "Tartarus Guardians: List of All Mini-Bosses",
  url: "https://game8.co/games/Persona-3-Reload/archives/440374",
  domain: "game8.co",
} as const;

export const tartarusGuardians: TartarusGuardian[] = [
  { name: "Ruthless Ice Raven", level: 4, floor: 5, affinities: { fire: "Weak", wind: "Resist" } },
  { name: "Barbaric Beast Wheel", level: 7, floor: 11, affinities: { fire: "Resist", wind: "Weak" } },
  { name: "Swift Axle", level: 9, floor: 17, affinities: { strike: "Resist", electric: "Weak", wind: "Resist" } },
  { name: "Will O Wisp Raven", level: 12, floor: 28, affinities: { fire: "Drain", ice: "Weak", wind: "Resist" } },
  { name: "Heretic Magus", level: 13, floor: 35, affinities: { electric: "Weak", wind: "Resist" } },
  { name: "Disturbing Dice", level: 14, floor: 36, affinities: { fire: "Resist" } },
  { name: "Clairvoyant Relic", level: 16, floor: 42, affinities: { light: "Null" } },
  { name: "Servant Tower", level: 18, floor: 47, affinities: { fire: "Null", ice: "Resist", electric: "Repel", wind: "Resist", light: "Null", dark: "Weak" } },
  { name: "Lascivious Lady", level: 20, floor: 54, affinities: { fire: "Null", ice: "Null", electric: "Null", wind: "Null", light: "Null", dark: "Null" } },
  { name: "Fleetfooted Cavalry", level: 22, floor: 60, affinities: { wind: "Drain", light: "Null", dark: "Null" } },
  { name: "Ochlocratic Sand", level: 27, floor: 77, affinities: { fire: "Repel", ice: "Weak", electric: "Null", wind: "Null", light: "Resist", dark: "Resist" } },
  { name: "Arcanist Decapitator", level: 29, floor: 82, affinities: { ice: "Null", wind: "Null" } },
  { name: "Deviant Convict", level: 31, floor: 90, affinities: {} },
  { name: "Tome of Atrophy", level: 31, floor: 90, affinities: { fire: "Weak", electric: "Null" } },
  { name: "Controlling Partner", level: 32, floor: 91, affinities: { slash: "Null", strike: "Null", light: "Null", dark: "Null" } },
  { name: "Dependent Partner", level: 32, floor: 91, affinities: { pierce: "Weak", fire: "Null", ice: "Null", electric: "Null", wind: "Null", light: "Null", dark: "Null" } },
  { name: "Five Fingers of Blight", level: 36, floor: 99, affinities: { ice: "Null", dark: "Weak" } },
  { name: "Venomous Magus", level: 36, floor: 99, affinities: { fire: "Null", electric: "Weak", wind: "Null" } },
  { name: "Bloody Maria", level: 37, floor: 105, affinities: { pierce: "Weak", fire: "Null", ice: "Null", electric: "Null", wind: "Null", light: "Null", dark: "Null" } },
  { name: "Executioner's Crown", level: 37, floor: 105, affinities: { fire: "Weak", wind: "Drain", light: "Null" } },
  { name: "Imposing Skyscraper", level: 39, floor: 112, affinities: { pierce: "Resist", electric: "Drain", wind: "Resist" } },
  { name: "Heartless Relic", level: 43, floor: 125, affinities: { electric: "Weak", light: "Resist", dark: "Resist" } },
  { name: "Rampaging Sand", level: 43, floor: 125, affinities: { strike: "Weak", fire: "Resist", ice: "Resist", electric: "Resist", wind: "Resist" } },
  { name: "Raging Turret", level: 43, floor: 126, affinities: { slash: "Null", wind: "Weak" } },
  { name: "Terminal Table", level: 44, floor: 132, affinities: { strike: "Null", light: "Drain" } },
  { name: "Jotun of Authority", level: 45, floor: 136, affinities: { slash: "Drain", fire: "Null", ice: "Weak" } },
  { name: "Isolated Castle", level: 46, floor: 143, affinities: { fire: "Null", ice: "Null", electric: "Null", wind: "Null", light: "Null", dark: "Null" } },
  { name: "Pagoda of Disaster", level: 49, floor: 151, affinities: { strike: "Weak", electric: "Drain", wind: "Drain" } },
  { name: "Dancing Beast Wheel", level: 50, floor: 155, affinities: { ice: "Null", light: "Resist" } },
  { name: "Demented Knight", level: 51, floor: 161, affinities: { pierce: "Null", fire: "Null", wind: "Weak" } },
  { name: "Cruel Greatsword", level: 52, floor: 170, affinities: { slash: "Null", light: "Weak", dark: "Null" } },
  { name: "Invigorated Gigas", level: 53, floor: 171, affinities: { ice: "Resist", light: "Null", dark: "Null" } },
  { name: "Cultist of the Storm", level: 62, floor: 179, affinities: { strike: "Null", fire: "Resist", dark: "Weak" } },
  { name: "Executive Greatsword", level: 64, floor: 184, affinities: { fire: "Weak", electric: "Drain", light: "Repel" } },
  { name: "Merciless Judge", level: 64, floor: 184, affinities: { slash: "Null", strike: "Null", ice: "Null", electric: "Resist" } },
  { name: "Chaos Panzer", level: 64, floor: 188, affinities: { fire: "Null", wind: "Null", light: "Repel" } },
  { name: "Necromachinery", level: 64, floor: 193, affinities: { slash: "Null", electric: "Null", light: "Repel" } },
  { name: "Icebreaker Lion", level: 66, floor: 203, affinities: { strike: "Null", fire: "Weak", ice: "Null", dark: "Resist" } },
  { name: "Luckless Cupid", level: 66, floor: 203, affinities: { fire: "Drain", electric: "Weak", light: "Repel" } },
  { name: "Blazing Middle Sibling", level: 69, floor: 212, affinities: { fire: "Repel", ice: "Weak" } },
  { name: "Deadly Eldest Sibling", level: 69, floor: 212, affinities: { ice: "Drain", wind: "Drain", dark: "Repel" } },
  { name: "Voltaic Youngest Sibling", level: 69, floor: 212, affinities: { electric: "Repel", wind: "Weak" } },
  { name: "Scornful Dice", level: 70, floor: 218, affinities: { slash: "Drain", strike: "Drain", pierce: "Drain" } },
  { name: "Minotaur Nulla", level: 71, floor: 225, affinities: { strike: "Repel", electric: "Null", light: "Resist" } },
  { name: "Comeback Castle", level: 74, floor: 230, affinities: { slash: "Repel", ice: "Resist", electric: "Resist" } },
  { name: "Foot Soldier", level: 74, floor: 230, affinities: { strike: "Resist", pierce: "Repel", fire: "Weak", ice: "Null", wind: "Resist", light: "Drain" } },
  { name: "Mage Soldier", level: 74, floor: 230, affinities: { pierce: "Weak", fire: "Repel", electric: "Null", dark: "Drain" } },
  { name: "Obsessive Sand", level: 73, floor: 230, affinities: { fire: "Resist", ice: "Resist", electric: "Resist", wind: "Resist", light: "Resist", dark: "Resist" } },
  { name: "Overseer of Creation", level: 75, floor: 241, affinities: { light: "Repel", dark: "Repel" } },
  { name: "Appropriating Noble", level: 76, floor: 246, affinities: { strike: "Resist", ice: "Weak", light: "Null" } },
  { name: "Invasive Serpent", level: 76, floor: 246, affinities: { strike: "Weak", fire: "Drain", wind: "Resist" } },
  { name: "High Judge of Hell", level: 77, floor: 247, affinities: { slash: "Resist", strike: "Null", pierce: "Resist", ice: "Null", wind: "Null", dark: "Resist" } },
  { name: "Cultist of Death", level: 78, floor: 253, affinities: { ice: "Resist", electric: "Resist", wind: "Weak", light: "Drain", dark: "Drain" } },
  { name: "Hedonistic Sinner", level: 79, floor: 254, affinities: { slash: "Repel", pierce: "Repel", fire: "Null", electric: "Drain" } },
  { name: "Genocidal Mercenary", level: 80, floor: 255, affinities: { slash: "Resist", strike: "Repel", ice: "Drain", electric: "Repel", dark: "Repel" } },
];
