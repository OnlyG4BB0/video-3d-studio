import React from 'react';
import {Composition} from 'remotion';
import {fitShot} from './kit';
import {KineticTitle, kineticTitleDefaults} from './scenes/KineticTitle';
import {LogoReveal, logoRevealDefaults} from './scenes/LogoReveal';
import {MorningRoom, morningRoomDefaults} from './scenes/MorningRoom';
import {ProductOrbit, productOrbitDefaults} from './scenes/ProductOrbit';

// Every shot gets its size and length from its props, so one composition serves
// all three formats. Register new scenes here.
export const Root: React.FC = () => (
	<>
		<Composition
			id="ProductOrbit"
			component={ProductOrbit}
			defaultProps={productOrbitDefaults}
			calculateMetadata={fitShot}
		/>
		<Composition
			id="KineticTitle"
			component={KineticTitle}
			defaultProps={kineticTitleDefaults}
			calculateMetadata={fitShot}
		/>
		<Composition
			id="LogoReveal"
			component={LogoReveal}
			defaultProps={logoRevealDefaults}
			calculateMetadata={fitShot}
		/>
		<Composition
			id="MorningRoom"
			component={MorningRoom}
			defaultProps={morningRoomDefaults}
			calculateMetadata={fitShot}
		/>
	</>
);
