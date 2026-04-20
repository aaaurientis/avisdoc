import avisdocLogo from "@/assets/avisdoc-logo.png";

const AvisdocLogo = ({ className = "h-10" }: { className?: string }) => {
  return (
    <img 
      src={avisdocLogo} 
      alt="AvisDoc - Téléexpertise dermatologique" 
      className={className}
    />
  );
};

export default AvisdocLogo;
