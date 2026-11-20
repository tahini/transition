/*
 * Copyright Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import Path from 'transition-common/lib/services/path/Path';
import type {
    IPathRepository,
    PathGeojsonProperties,
    PathQueryFilter
} from 'transition-common/lib/services/path/IPathRepository';
import pathsDbQueries from '../../../models/db/transitPaths.db.queries';

/**
 * Backend implementation of the `IPathRepository` interface. It accesses the
 * data through database queries.
 *
 * FIXME Should we cache the individual `Path` objects? with a possible maximmum
 * count of objects
 */
export class BackendPathRepository implements IPathRepository {
    async get(id: string): Promise<Path> {
        const attributes = await pathsDbQueries.read(id);
        return new Path(attributes, false);
    }

    async getGeojsonCollection(): Promise<GeoJSON.FeatureCollection<GeoJSON.LineString, PathGeojsonProperties>> {
        return pathsDbQueries.geojsonCollectionNew();
    }

    async getSummaries(pathFilter: PathQueryFilter) {
        return pathsDbQueries.summaries(pathFilter);
    }

    async getObjects(pathFilter: PathQueryFilter): Promise<Path[]> {
        const objects = await pathsDbQueries.readObjects(pathFilter);
        return objects.map((attributes) => new Path(attributes, false));
    }
}

export default BackendPathRepository;
