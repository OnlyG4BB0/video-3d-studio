import type {SceneEntry} from '../kit';
import {ChapterEnd, filmEndDefaults} from './film/End';
import {ChapterLight, filmLightDefaults} from './film/Light';
import {ChapterMaterials, filmMaterialsDefaults} from './film/Materials';
import {ChapterMechanics, filmMechanicsDefaults} from './film/Mechanics';
import {ChapterModels, filmModelsDefaults} from './film/Models';
import {ChapterMotion, filmMotionDefaults} from './film/Motion';
import {ChapterShaders, filmShadersDefaults} from './film/Shaders';
import {ChapterTitle, filmTitleDefaults} from './film/Title';
import {KineticTitle, kineticTitleDefaults, kineticTitleMusic} from './KineticTitle';
import {LiquidForm, liquidFormDefaults} from './LiquidForm';
import {LogoReveal, logoRevealDefaults} from './LogoReveal';
import {MorningRoom, morningRoomDefaults} from './MorningRoom';
import {ProductOrbit, productOrbitDefaults} from './ProductOrbit';
import {TitleCard, titleCardDefaults, titleCardMusic} from './TitleCard';
import {RaceShowroom, raceShowroomDefaults} from './race/Showroom';
import {RaceTrack, raceTrackDefaults, raceTrackMusic} from './race/RaceTrack';
import {RaceEngine, raceEngineDefaults, raceEngineMusic} from './race/RaceEngine';
import {RaceGrid, raceGridDefaults, raceGridMusic} from './race/RaceGrid';
import {RaceCorner, raceCornerDefaults, raceCornerMusic} from './race/RaceCorner';
import {RaceValves, raceValvesDefaults, raceValvesMusic} from './race/RaceValves';
import {RacePullOut, racePullOutDefaults, racePullOutMusic} from './race/RacePullOut';
import {RaceNight, raceNightDefaults, raceNightMusic} from './race/RaceNight';

// Every scene is listed here once. Root.tsx turns each into a shot of its own, and
// a film can use any of them as a chapter, by this name. Add new scenes here.
export const SCENES: Record<string, SceneEntry> = {
	ProductOrbit: {component: ProductOrbit, defaults: productOrbitDefaults},
	KineticTitle: {component: KineticTitle, defaults: kineticTitleDefaults, music: kineticTitleMusic},
	LogoReveal: {component: LogoReveal, defaults: logoRevealDefaults},
	LiquidForm: {component: LiquidForm, defaults: liquidFormDefaults},
	MorningRoom: {component: MorningRoom, defaults: morningRoomDefaults},
	TitleCard: {component: TitleCard, defaults: titleCardDefaults, music: titleCardMusic},
	// The race film.
	RaceGrid: {component: RaceGrid, defaults: raceGridDefaults, music: raceGridMusic},
	RaceTrack: {component: RaceTrack, defaults: raceTrackDefaults, music: raceTrackMusic},
	RaceCorner: {component: RaceCorner, defaults: raceCornerDefaults, music: raceCornerMusic},
	RaceEngine: {component: RaceEngine, defaults: raceEngineDefaults, music: raceEngineMusic},
	RaceValves: {component: RaceValves, defaults: raceValvesDefaults, music: raceValvesMusic},
	RacePullOut: {component: RacePullOut, defaults: racePullOutDefaults, music: racePullOutMusic},
	RaceNight: {component: RaceNight, defaults: raceNightDefaults, music: raceNightMusic},
	RaceShowroom: {component: RaceShowroom, defaults: raceShowroomDefaults},
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
