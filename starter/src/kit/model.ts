import {Box3, Group, Mesh, Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {usePublicFile} from './assets';

/**
 * Loads a .glb model from public/ and returns it standing on y = 0, centred,
 * scaled to `height`. Returns null while loading or when no file is given.
 * Show it with <primitive object={model} /> inside <Stage>.
 */
export const useModelFile = (file: string | undefined, height = 2) =>
	usePublicFile(file, async (response) => {
		const {scene} = await new GLTFLoader().parseAsync(
			await response.arrayBuffer(),
			'',
		);
		scene.traverse((object) => {
			if ((object as Mesh).isMesh) {
				object.castShadow = true;
				object.receiveShadow = true;
			}
		});

		const box = new Box3().setFromObject(scene);
		const size = box.getSize(new Vector3());
		const centre = box.getCenter(new Vector3());
		const scale = height / size.y;
		scene.position.set(-centre.x, -box.min.y, -centre.z);

		const wrapper = new Group();
		wrapper.add(scene);
		wrapper.scale.setScalar(scale);
		return wrapper;
	});
