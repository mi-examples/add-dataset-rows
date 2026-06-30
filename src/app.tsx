import './assets/css/app.scss';
import AddRows from './components/add-rows/add-rows.tsx';
import { APP_TITLE } from './constants.ts';

function App() {
  return (
    <main className="app">
      <h1 className="app__title">{APP_TITLE}</h1>
      <p className="app__subtitle">Select a dataset and add a row.</p>
      <AddRows />
    </main>
  );
}

export default App;
