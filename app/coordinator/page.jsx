import {redirect} from 'next/navigation';
import {getCoordinatorUser} from '../../lib/portalAuth';
import CoordinatorDashboard from '../admin/AdminDashboard';
export const dynamic='force-dynamic';
export const metadata={title:'Reading Coordinator · CRL-App'};
export default async function Page(){if(!(await getCoordinatorUser()))redirect('/coordinator/login');return <CoordinatorDashboard/>;}
