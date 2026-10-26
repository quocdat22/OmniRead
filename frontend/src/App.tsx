import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import Library from "./pages/Library";
import Reader from "./pages/Reader";
import Settings from "./pages/Settings";

// key={id}: đổi sách -> remount, reset toàn bộ state của Reader.
function ReaderRoute() {
  const { id } = useParams();
  return <Reader key={id} bookId={Number(id)} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/read/:id" element={<ReaderRoute />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/setting" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}
