#!/usr/bin/env node
// Creates a new video project from the starter and installs its packages.
//
//   node scripts/new-project.mjs path/to/my-video

import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
	console.error(`Node.js 18 or newer is required. This is ${process.version}.`);
	process.exit(1);
}

const target = process.argv[2];
if (!target) {
	console.error('Usage: node scripts/new-project.mjs <folder-for-the-new-project>');
	process.exit(1);
}

const destination = path.resolve(target);
if (existsSync(destination) && readdirSync(destination).length > 0) {
	console.error(`${destination} already has files in it. Choose an empty folder.`);
	process.exit(1);
}

const starter = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'starter',
);

cpSync(starter, destination, {
	recursive: true,
	filter: (source) => {
		const relative = path.relative(starter, source);
		const first = relative.split(path.sep)[0];
		return first !== 'node_modules' && first !== 'out';
	},
});

console.log(`Project created in ${destination}. Installing packages...`);
const install = spawnSync('npm', ['install', '--no-fund', '--no-audit'], {
	cwd: destination,
	stdio: 'inherit',
	shell: process.platform === 'win32',
});
if (install.status !== 0) {
	console.error('npm install failed. Fix the error above, then run it again in the project.');
	process.exit(install.status ?? 1);
}
console.log(`Ready: ${destination}`);
