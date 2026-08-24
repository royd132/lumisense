import { LockOutlined } from "@ant-design/icons";
import {
  roleProfiles,
  type LumiRole,
} from "../features/demo/domain/lumisense-demo";

export default function RoleGate({ role, allow, children }: { role: LumiRole; allow: LumiRole[]; children: React.ReactNode }) {
  if (allow.includes(role)) return <>{children}</>;
  return (
    <div className="role-gate">
      <span className="gate-icon"><LockOutlined /></span>
      <div>
        <b>当前角色不可执行</b>
        <p>{roleProfiles[role].label}仅保留 PRD 权限矩阵允许的能力。</p>
      </div>
    </div>
  );
}
