import {ShaderChunk} from 'three';

// Two small changes to three's lighting code. three is pinned to an exact version
// in package.json, so these strings stay valid until it is deliberately upgraded.

const IBL_DIFFUSE = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
const originalLightMaps = ShaderChunk.lights_fragment_maps;

/**
 * Scales how much the environment lights matte surfaces, without changing what
 * shiny surfaces reflect. Environment light cannot be blocked by objects, so
 * keeping it low lets SkyLight provide fill that does cast soft shadows.
 */
export const setEnvironmentDiffuse = (scale: number) => {
	if (!originalLightMaps.includes(IBL_DIFFUSE)) {
		throw new Error('This version of three is not supported by the kit.');
	}
	ShaderChunk.lights_fragment_maps = originalLightMaps.replace(
		IBL_DIFFUSE,
		`iblIrradiance += getIBLIrradiance( geometryNormal ) * ${scale.toFixed(4)};`,
	);
};

// SkyLight moves on every sample. Its diffuse light averages into smooth shading,
// but its specular highlight would show up as a pattern of dots on shiny objects,
// so a negative shadow radius marks a light as diffuse-only.
const DIRECTIONAL_CALL =
	/(vDirectionalShadowCoord\[ i \] \) : 1\.0;\s*#endif\s*)(RE_Direct\([^;]*;)/;

if (!DIRECTIONAL_CALL.test(ShaderChunk.lights_fragment_begin)) {
	throw new Error('This version of three is not supported by the kit.');
}

ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin.replace(
	DIRECTIONAL_CALL,
	(_match, before: string, call: string) => `${before}
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		if ( directionalLightShadow.shadowRadius < 0.0 ) {
			vec3 keptSpecular = reflectedLight.directSpecular;
			#ifdef USE_CLEARCOAT
			vec3 keptClearcoat = clearcoatSpecularDirect;
			#endif
			#ifdef USE_SHEEN
			vec3 keptSheen = sheenSpecularDirect;
			#endif
			${call}
			reflectedLight.directSpecular = keptSpecular;
			#ifdef USE_CLEARCOAT
			clearcoatSpecularDirect = keptClearcoat;
			#endif
			#ifdef USE_SHEEN
			sheenSpecularDirect = keptSheen;
			#endif
		} else {
			${call}
		}
		#else
		${call}
		#endif`,
);
