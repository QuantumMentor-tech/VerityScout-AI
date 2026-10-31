import React from 'react';
import styles from './AppSidebar.module.css';
import { NavigationLinks } from './NavigationLinks';

export function AppSidebar(): React.JSX.Element {
  return (
    <aside className={styles.sidebar} aria-label="Sidebar Navigation">
      <NavigationLinks />

      <div className={styles.sidebarFooter}>
        <span className={styles.versionTag}>VerityScout Engine</span>
        <span className={styles.phaseTag}>Phase 3 • Step 13 Shell</span>
      </div>
    </aside>
  );
}
