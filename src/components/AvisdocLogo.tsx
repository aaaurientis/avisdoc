import avisdocLogo from "@/assets/avisdoc-logo.png";

const AvisdocLogo = ({ className = "h-10" }: { className?: string }) => (
  <img
    src={avisdocLogo}
    alt="AvisDoc — Téléexpertise dermatologique"
    width={471}
    height={529}
    decoding="async"
    className={className}
  />
);

export default AvisdocLogo;
