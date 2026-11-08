import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {
	ensureBrowser,
	getCompositions,
	openBrowser,
	selectComposition,
} from '@remotion/renderer';

export const PROJECT_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
export const TIMEOUT_MS = 600_000;

const splitOnce = (text, separator) => {
	const at = text.indexOf(separator);
	return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
};

const coerce = (value) => {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	return value.replaceAll('\\n', '\n');
};

/** Parses `Name --flag value --set key=value`. Works the same in every shell. */
export const parseArguments = (argv) => {
	const positional = [];
	const flags = {};
	const sets = {};
	for (let i = 0; i < argv.length; i++) {
		const argument = argv[i];
		if (!argument.startsWith('--')) {
			positional.push(argument);
			continue;
		}
		const [key, inline] = splitOnce(argument.slice(2), '=');
		const value = inline ?? argv[++i];
		if (value === undefined) {
			throw new Error(`--${key} needs a value`);
		}
		if (key === 'set') {
			const [name, setting] = splitOnce(value, '=');
			if (setting === undefined) {
				throw new Error(`--set needs name=value, got "${value}"`);
			}
			sets[name] = coerce(setting);
		} else {
			flags[key] = value;
		}
	}
	return {positional, flags, sets};
};

export const readProps = (flags, sets) => {
	const fromFile = flags['props-file']
		? JSON.parse(fs.readFileSync(path.resolve(flags['props-file']), 'utf8'))
		: {};
	return {...fromFile, ...sets};
};

// Module concatenation only makes the bundle smaller, which does not matter for
// a local render. With it on, webpack stopped with "Unexpected end of JSON input"
// when this kit was tested on Node.js 23.2. Keep this in step with remotion.config.ts.
const withoutConcatenation = (config) => ({
	...config,
	optimization: {...config.optimization, concatenateModules: false},
});

const glCandidates = (flags) =>
	flags.gl ? [flags.gl] : (process.env.VIDEO3D_GL?.split(',') ?? ['angle', 'swangle']);

const isGraphicsFailure = (error) =>
	/webgl|gl context|context lost|gpu process/i.test(String(error?.message ?? error));

/**
 * Bundles the project, opens a browser and hands both to `work`.
 * If the graphics card route fails it retries once with software rendering.
 */
export const withRenderer = async ({id, inputProps, flags}, work) => {
	console.log('Bundling the project...');
	const serveUrl = await bundle({
		entryPoint: path.join(PROJECT_ROOT, 'src', 'index.ts'),
		rootDir: PROJECT_ROOT,
		webpackOverride: withoutConcatenation,
	});
	await ensureBrowser();

	const candidates = glCandidates(flags);
	for (let attempt = 0; attempt < candidates.length; attempt++) {
		const gl = candidates[attempt];
		const chromiumOptions = {gl, enableMultiProcessOnLinux: true};
		const puppeteerInstance = await openBrowser('chrome', {chromiumOptions});
		try {
			const available = await getCompositions(serveUrl, {
				inputProps,
				chromiumOptions,
				puppeteerInstance,
				timeoutInMilliseconds: TIMEOUT_MS,
			});
			if (!available.some((composition) => composition.id === id)) {
				throw new Error(
					`No shot called "${id}". Available: ${available.map((c) => c.id).join(', ')}`,
				);
			}
			const composition = await selectComposition({
				serveUrl,
				id,
				inputProps,
				chromiumOptions,
				puppeteerInstance,
				timeoutInMilliseconds: TIMEOUT_MS,
			});
			console.log(
				`${id}: ${composition.width}x${composition.height}, ${composition.durationInFrames} frames at ${composition.fps} fps (renderer: ${gl})`,
			);
			return await work(
				{
					serveUrl,
					composition,
					chromiumOptions,
					puppeteerInstance,
				},
				gl,
			);
		} catch (error) {
			const canRetry = attempt < candidates.length - 1 && isGraphicsFailure(error);
			if (!canRetry) {
				throw error;
			}
			console.warn(`Renderer "${gl}" failed, trying "${candidates[attempt + 1]}"...`);
		} finally {
			await puppeteerInstance.close({silent: true});
		}
	}
	return undefined;
};

/**
 * How many passes to average per frame. Software rendering has no graphics card
 * to lean on, so it gets far fewer.
 */
export const samplesFor = ({gl, flags, fallback}) => {
	const wanted = Number(flags.samples ?? fallback);
	return gl === 'swangle' ? Math.min(wanted, 4) : wanted;
};

export const defaultConcurrency = () =>
	Math.max(1, Math.min(4, Math.floor(os.cpus().length / 4)));

export const fail = (error) => {
	console.error(`\n${error?.stack ?? error}`);
	process.exit(1);
};
