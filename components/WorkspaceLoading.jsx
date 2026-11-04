import DashboardSkeleton from './DashboardSkeleton';
export default function WorkspaceLoading({label='Loading…',variant='table',...props}){return <DashboardSkeleton label={label} variant={variant} {...props}/>;}
