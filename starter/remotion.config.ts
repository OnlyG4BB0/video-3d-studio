import {Config} from '@remotion/cli/config';

// These settings apply to Remotion Studio. The stills and render tools set their own.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// See the note in tools/lib.mjs.
Config.overrideWebpackConfig((config) => ({
	...config,
	optimization: {...config.optimization, concatenateModules: false},
}));
