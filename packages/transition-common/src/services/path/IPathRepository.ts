/*
 * Copyright Polytechnique Montreal and contributors
 *
 * This file is licensed under the MIT License.
 * License text available at https://opensource.org/licenses/MIT
 */

import type Path from './Path';
import type { PathDirection } from './Path';

/**
 * Description of the values paths can be queried on
 */
export type PathQueryFilter = {
    /**
     * The lines_ids whose path we want returned
     */
    lineIds?: string[];
    /**
     * The IDs of the agencies we want paths for
     */
    agencyIds?: string[];
    /**
     * The IDs of the paths to query
     */
    pathIds?: string[];
};

/**
 * Common properties for summaries and geojson
 */
type BasePathData = {
    id: string;
    mode?: string;
    lineId: string;
    direction: PathDirection;
    name?: string;
    color?: string;
};

/**
 * Expected properties for the geojson path data
 */
export type PathGeojsonProperties = BasePathData & {
    lineShortname?: string;
    lineName?: string;
    agencyAcronym: string;
};

/**
 * List of properties available for path summary queries
 */
export type PathSummaryData = BasePathData & {
    nodeCount: number;
    // FIXME Summary should also include some stats. TBD once we implement it, as the desired stat may vary for users and it may be a range. It needs more spec
};

/**
 * Provides asynchronous access to transit path data without coupling callers
 * to its storage source. Use `get` and `getObjects` when complete `Path`
 * domain objects are needed, and `getSummaries` or `getGeojsonCollection`
 * when callers need data for display without the full object behavior.
 *
 * TODO Only the getters are implemented for now, the repository will also
 * implement the create/update/delete methods. They will be added when they are
 * ready to be implemented.
 */
export interface IPathRepository {
    /**
     * Get a single complete path object by id
     *
     * @param {string} id The ID of the path to retrieve
     * @returns A complete Path object
     */
    get: (id: string) => Promise<Path>;

    /**
     * Get the geojson feature collection of paths
     *
     * @returns A geojson feature collection with all paths
     */
    getGeojsonCollection: (
        pathFilter: PathQueryFilter
    ) => Promise<GeoJSON.FeatureCollection<GeoJSON.LineString, PathGeojsonProperties>>;

    /**
     * Get a minimal list of information about paths for a given filter. This
     * method should be used to display path elements in a list. It does not
     * contain all the path's information.
     *
     * @param pathFilter The path query filter
     * @returns A minimal path information, suitable for list display
     */
    getSummaries: (pathFilter: PathQueryFilter) => Promise<PathSummaryData[]>;

    /**
     * Get an array of complete Path objects for a given filter. This method
     * should be used to get in a single query many objects. This can return a
     * substantial amount of data.
     *
     * @param pathFilter
     * @returns
     */
    getObjects: (pathFilter: PathQueryFilter) => Promise<Path[]>;
}
