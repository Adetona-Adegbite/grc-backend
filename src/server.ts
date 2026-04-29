<<<<<<< HEAD

=======
>>>>>>> 454a6887bfacb4ba41fbf0c65321a0c6e70b5df9
import dotenv from "dotenv";
import { validateEnv } from "./config/env";

dotenv.config();

validateEnv();
import app from "./app";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
