import { BrandLogo } from "../shell/BrandLogo";

export function LoadingScreen() {
  return (
    <div className="panel-boot-loader" role="status" aria-live="polite" aria-label="加载中">
      <BrandLogo className="panel-boot-logo animate-pulse-slow" />
      <span className="sr-only">加载中</span>
    </div>
  );
}
