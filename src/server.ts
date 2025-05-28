import app from "./app";

const PORT = process.env.PORT || 7600;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
