import React, { useEffect } from 'react';
import './index.css';
import CricketBuddy from './CricketBuddy';

function App() {
  useEffect(() => {
    // Add debugging info to console
    console.log('%cCricketBuddy Testing Environment Ready', 'color: #FFB627; font-size: 16px; font-weight: bold;');
    console.log('%cDebug Commands:', 'color: #4FA3D1; font-weight: bold;');
    console.log('window.storage.debug() - View storage info');
    console.log('window.storage.clearAll() - Clear all data');
  }, []);

  return (
    <div>
      <CricketBuddy />
    </div>
  );
}

export default App;
