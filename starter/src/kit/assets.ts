import {useEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

/**
 * Loads a file from public/ and holds the render until it is ready.
 * Call this in the scene component, outside <Stage>.
 */
export const usePublicFile = <T,>(
	file: string | undefined,
	parse: (response: Response) => Promise<T>,
): T | null => {
	const [value, setValue] = useState<T | null>(null);
	const [handle] = useState(() =>
		file ? delayRender(`Loading public/${file}`) : null,
	);
	const parseRef = useRef(parse);

	useEffect(() => {
		if (!file) {
			return;
		}
		fetch(staticFile(file))
			.then((response) => {
				if (!response.ok) {
					throw new Error(`public/${file} was not found (${response.status})`);
				}
				return parseRef.current(response);
			})
			.then((parsed) => setValue(() => parsed))
			.catch((error) => cancelRender(error));
	}, [file]);

	useEffect(() => {
		if (value !== null && handle !== null) {
			continueRender(handle);
		}
	}, [value, handle]);

	return value;
};
