import type {SceneEntry} from '../kit';
import {ChapterEnd, filmEndDefaults} from './film/End';
import {ChapterLight, filmLightDefaults} from './film/Light';
import {ChapterMaterials, filmMaterialsDefaults} from './film/Materials';
import {ChapterMechanics, filmMechanicsDefaults} from './film/Mechanics';
import {ChapterModels, filmModelsDefaults} from './film/Models';
import {ChapterMotion, filmMotionDefaults} from './film/Motion';
import {ChapterShaders, filmShadersDefaults} from './film/Shaders';
import {ChapterTitle, filmTitleDefaults} from './film/Title';
import {KineticTitle, kineticTitleDefaults} from './KineticTitle';
import {LiquidForm, liquidFormDefaults} from './LiquidForm';
import {LogoReveal, logoRevealDefaults} from './LogoReveal';
import {MorningRoom, morningRoomDefaults} from './MorningRoom';
import {ProductOrbit, productOrbitDefaults} from './ProductOrbit';

// Every scene is listed here once. Root.tsx turns each into a shot of its own, and
// a film can use any of them as a chapter, by this name. Add new scenes here.
export const SCENES: Record<string, SceneEntry> = {
	ProductOrbit: {component: ProductOrbit, defaults: productOrbitDefaults},
	KineticTitle: {component: KineticTitle, defaults: kineticTitleDefaults},
	LogoReveal: {component: LogoReveal, defaults: logoRevealDefaults},
	LiquidForm: {component: LiquidForm, defaults: liquidFormDefaults},
	MorningRoom: {component: MorningRoom, defaults: morningRoomDefaults},
	// The chapters of the example film.
	FilmTitle: {component: ChapterTitle, defaults: filmTitleDefaults},
	FilmLight: {component: ChapterLight, defaults: filmLightDefaults},
	FilmModels: {component: ChapterModels, defaults: filmModelsDefaults},
	FilmMaterials: {component: ChapterMaterials, defaults: filmMaterialsDefaults},
	FilmMotion: {component: ChapterMotion, defaults: filmMotionDefaults},
	FilmShaders: {component: ChapterShaders, defaults: filmShadersDefaults},
	FilmMechanics: {component: ChapterMechanics, defaults: filmMechanicsDefaults},
	FilmEnd: {component: ChapterEnd, defaults: filmEndDefaults},
};
