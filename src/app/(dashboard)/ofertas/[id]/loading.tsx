export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-12 w-1/3 rounded-lg bg-[#edebf2]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-24 rounded-tr-3xl rounded-bl-3xl bg-[#edebf2]" />
        <div className="h-24 rounded-tr-3xl rounded-bl-3xl bg-[#edebf2]" />
        <div className="h-24 rounded-tr-3xl rounded-bl-3xl bg-[#edebf2]" />
      </div>
      <div className="h-64 rounded-tr-3xl rounded-bl-3xl bg-[#edebf2]" />
    </div>
  );
}
