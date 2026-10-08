/**
 * Central module aggregator for cb-mapui
 * Imports and initializes all core modules, map utilities, views, and features.
 */

// 1. Common & Core Foundation
import './common/popup-styles.js';
import './core/utils.js';
import './core/api.js';
import './core/connection.js';
import './core/central-loaders.js';

// 2. Map & Geometry
import './map/geometry.js';
import './map/gis-styling.js';
import './map/map-core.js';

// 3. Views
import './views/infra-card.js';

// 4. Features
import './features/tombstones/tombstone-mgr.js';
import './features/labels/label-system.js';
import './features/base64/base64-panel.js';
import './features/credentials/credential-holder.js';
import './features/credentials/csp-registration.js';
import './features/infra-control/infra-control.js';
import './features/k8s/k8s-cluster.js';
import './features/network/gateway-dns.js';
import './features/network/network-services.js';
import './features/resource-list/resource-list.js';
import './features/security-group/security-group.js';
import './features/spec/spec-config.js';
import './features/provision/provision-wizard.js';
import './features/scaleout/scaleout-mgr.js';
import './features/remote-command/remote-command.js';
import './features/snapshots/snapshot-mgr.js';
import './features/schedule/schedule-mgr.js';
import './features/tasks/task-mgr.js';
import './features/templates/template-mgr.js';
import './features/autopilot/autopilot.js';
import './features/object-storage/object-storage-mgr.js';

// 5. Topology Views
import './features/topology/resource-graph.js';
import './features/topology/network-graph.js';

export * from './core/api.js';
export * from './core/utils.js';
export * from './map/gis-styling.js';


