import { initializeHost } from './bridge-runtime';
import React from 'react';
import { createRoot } from 'react-dom/client';
import ScoreEditor from '../vendor/ots-editor/components/ScoreEditor';
import { NoticeHost } from '../vendor/ots-editor/components/shell/notices';
import { Announcer } from '../vendor/ots-editor/components/shell/announcer';
initializeHost();
createRoot(document.getElementById('root')!).render(<><ScoreEditor /><NoticeHost /><Announcer /></>);
