import type {MeshPhysicalMaterialParameters} from 'three';

type Look = (color?: string) => MeshPhysicalMaterialParameters;

/**
 * Starting points for <meshPhysicalMaterial {...LOOKS.chrome()} />.
 * Pass a colour and override anything else by spreading more props after it.
 */
export const LOOKS = {
	chrome: ((color = '#f1f1f3') => ({color, metalness: 1, roughness: 0.06})) as Look,
	brushedMetal: ((color = '#c9c9cc') => ({
		color,
		metalness: 1,
		roughness: 0.34,
	})) as Look,
	gold: ((color = '#d8b169') => ({color, metalness: 1, roughness: 0.2})) as Look,
	powderCoat: ((color = '#2a4f47') => ({
		color,
		metalness: 0.05,
		roughness: 0.58,
		clearcoat: 0.12,
		clearcoatRoughness: 0.5,
	})) as Look,
	glossPlastic: ((color = '#c8322d') => ({
		color,
		roughness: 0.25,
		clearcoat: 1,
		clearcoatRoughness: 0.08,
	})) as Look,
	ceramic: ((color = '#ece6db') => ({
		color,
		roughness: 0.42,
		clearcoat: 0.45,
		clearcoatRoughness: 0.2,
	})) as Look,
	rubber: ((color = '#17181a') => ({color, roughness: 0.92})) as Look,
	velvet: ((color = '#5a2438') => ({
		color,
		roughness: 1,
		sheen: 1,
		sheenRoughness: 0.45,
		sheenColor: color,
	})) as Look,
	stone: ((color = '#b9b3a7') => ({color, roughness: 0.82})) as Look,
	plaster: ((color = '#e8e3d9') => ({color, roughness: 0.94})) as Look,
	glass: ((color = '#ffffff') => ({
		color,
		roughness: 0.03,
		transmission: 1,
		ior: 1.5,
		thickness: 0.7,
	})) as Look,
};

export type LookName = keyof typeof LOOKS;
