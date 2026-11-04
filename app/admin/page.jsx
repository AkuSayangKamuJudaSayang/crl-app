import { redirect } from "next/navigation";
import { getAdminUser } from "../../lib/adminAuth";
import SystemAdminDashboard from "../../components/SystemAdminDashboard";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return <SystemAdminDashboard />;
}
