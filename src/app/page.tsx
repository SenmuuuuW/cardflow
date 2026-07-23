import { cardflowProject } from "@/lib/cardflow-project";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f6f4] px-6 py-10 text-[#18231f] sm:px-10 lg:px-16">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <div className="w-full border-l-4 border-[#19715c] pl-6 sm:pl-8">
          <p className="text-sm font-semibold text-[#19715c]">
            {cardflowProject.foundationLabel.toUpperCase()}
          </p>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
            {cardflowProject.name}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[#50605a]">
            {cardflowProject.homepageDescription}
          </p>
          <p className="mt-8 text-sm text-[#50605a]">
            {cardflowProject.homepageStatus}
          </p>
        </div>
      </section>
    </main>
  );
}
