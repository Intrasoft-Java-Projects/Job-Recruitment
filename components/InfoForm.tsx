"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { data } from "autoprefixer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type Question = {
  id: number;
  form_id: number;
  section: string;
  subsection?: string;
  type: string;
  label: string;
  options?: { label: string; value: string }[];
  parent_question_id?: number;
  condition_value?: string;
};

export default function DynamicForm() {
  const searchParams = useSearchParams();
  const formId = Number(searchParams.get("formid")) || 1; // Read formId from query string

  const [questions, setQuestions] = useState<Question[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // State for collapsed/expanded fieldsets
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!formId) return;

    const fetchQuestions = async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("form_id", formId) // Fetch questions for the specific form
        .eq("status", true)
        .order("id");
      if (error) console.error("Error fetching questions:", error.message);
      setQuestions(data || []);

      // Initialize all sections as collapsed
      const initialCollapsedState: Record<string, boolean> = {};
      data?.forEach((q) => {
        if (q.section) initialCollapsedState[q.section] = false;
        if (q.subsection)
          initialCollapsedState[`${q.section}-${q.subsection}`] = false;
      });

      setCollapsedSections(initialCollapsedState);
      setLoading(false);
    };
    fetchQuestions();
  }, [formId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const target = e.target; // Save reference to target
    const { name, value, type } = target;

    if (target instanceof HTMLInputElement && type === "checkbox") {
      // ✅ Now TypeScript knows it's a checkbox
      setFormData((prevData) => ({
        ...prevData,
        [name]: target.checked, // No more TypeScript error
      }));
    } else {
      setFormData((prevData) => ({
        ...prevData,
        [name]: value,
      }));
    }
  };

  useEffect(() => {
    console.log("Updated formData:", formData);
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Prepare responses
      const responsePayload = await Promise.all(
        questions.map(async (question) => {
          let answer = formData[question.id] || "";

          // If it's a file, upload it to Supabase Storage
          if (
            question.type === "file" &&
            formData[question.id] instanceof File
          ) {
            const file = formData[question.id];
            const { data: fileData, error: fileError } = await supabase.storage
              .from("profile_photo") // Replace "uploads" with your storage bucket name
              .upload(
                `files/${file.name}`,
                file
              );

            if (fileError) throw fileError;
            answer = fileData?.path || ""; // Use the file path as the answer
          }

          return {
            question_id: question.id,
            answer,
          };
        })
      );

      // Upsert responses (insert or update)
      const { error: responseError } = await supabase
        .from("responses")
        .upsert(responsePayload, { onConflict: "organization_id,question_id" }); // ✅ Correct (string)

      if (responseError) throw responseError;

      setSubmitted(true);
    } catch (error) {
      console.error("Submission error:", error);
      alert("An error occurred while submitting the form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderQuestion = (question: Question) => {
    const { id, type, label, options, parent_question_id, condition_value } =
      question;

    // Check if this question is a conditional sub-question and if it should be displayed
    const shouldDisplay =
      !parent_question_id || // Show if it's a parent question
      (parent_question_id && formData[parent_question_id] === condition_value); // Show if condition matches

    if (!shouldDisplay) return null;

    switch (type) {
      case "text":
        return (
          <label key={id} className="block">
            <span className="whitespace-pre-line">{label}</span> {/* Enables line breaks */}
            <input
              type="text"
              name={String(id)}
              value={formData[id] || ""} // Ensure it updates properly
              onChange={handleChange}
              className="w-full mt-2 p-2 border rounded"
            />
          </label>
        );

      case "radio":
        return (
          <div key={id} className="mb-4">
            <span className="block whitespace-pre-line">{label}</span>
            {options?.map((option) => (
              <label key={option.value} className="mr-4">
                <input
                  type="radio"
                  name={String(id)}
                  value={option.value}
                  checked={formData[id] === option.value}
                  onChange={handleChange}
                  className="mr-2"
                />
                {option.label}
              </label>
            ))}

            {/* Render sub-questions conditionally */}
            {questions
              .filter(
                (subQuestion) =>
                  subQuestion.parent_question_id === id &&
                  formData[id] === subQuestion.condition_value
              )
              .map((subQuestion) => (
                <div className="ml-4 mt-4" key={subQuestion.id}>
                  {renderQuestion(subQuestion)}
                </div>
              ))}
          </div>
        );

      case "select":
        return (
          <div key={id} className="mb-4">
            <label className="block whitespace-pre-line">{label}</label>
            <select
              name={String(id)}
              value={formData[id] || ""}
              onChange={handleChange}
              className="w-full mt-2 p-2 border rounded"
            >
              <option value="">Select an option</option>
              {options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case "checkbox":
        return (
          <div key={id} className="mb-4">
            <span className="block whitespace-pre-line">{label}</span>
            {options?.map((option) => (
              <label key={option.value} className="mr-4 flex items-center">
                <input
                  type="checkbox"
                  name={`${id}-${option.value}`}
                  value={option.value}
                  checked={formData[id]?.includes(option.value) || false} // Ensure checkbox stays checked
                  onChange={(e) => handleCheckboxChange(e, id)}
                  className="mr-2"
                />
                {option.label}
              </label>
            ))}
          </div>
        );

      case "file":
        return (
          <label key={id} className="block mb-4">
            <span className="whitespace-pre-line">{label}</span>
            <input
              type="file"
              name={String(id)}
              onChange={(e) => handleFileChange(e, id)}
              className="w-full mt-2 p-2 border rounded"
            />
            {formData[id] && (
              <p className="text-sm text-gray-600 mt-1">
                Uploaded: {formData[id]?.name || formData[id]}
              </p>
            )}
          </label>
        );

      case "textarea":
        return (
          <label key={id} className="block mb-4">
            <span className="whitespace-pre-line">{label}</span>
            <textarea
              name={String(id)}
              value={formData[id] || ""}
              onChange={handleChange}
              className="w-full mt-2 p-2 border rounded"
            />
          </label>
        );

      case "file-photo":
        return (
          <div key={id} className="mb-4">
            <label className="block mb-4">{label}</label>

            {/* Profile Picture Upload & Preview */}
            <div className="flex flex-col items-center">
              <label className="relative cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFilePhotoChange(e, id)}
                />

                {/* Show preview if an image is selected */}
                {formData[id] ? (
                  <Image
                    src={
                      formData[id] instanceof File
                        ? URL.createObjectURL(formData[id]) // Show local preview before upload
                        : formData[id] // Show uploaded image URL
                    }
                    alt="Profile Preview"
                    width={150}
                    height={150}
                    className="rounded-full border border-gray-300"
                  />
                ) : (
                  <Image
                    src="/dummy.png"
                    alt="Upload Placeholder"
                    width={150}
                    height={150}
                    className="rounded-full border border-gray-300"
                  />
                )}
              </label>
              <p className="text-xs text-gray-500 mt-2">Click to upload</p>
            </div>
          </div>
        );


      default:
        return null;
    }
  };

  const handleFilePhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    questionId: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview
    setFormData((prevData) => ({
      ...prevData,
      [questionId]: file, // Store file temporarily before upload
    }));

    try {
      // Upload file to Supabase Storage
      // const { data, error } = await supabase.storage
      //   .from("profile_photo") // Ensure the correct bucket name
      //   .upload(`profile_pics/${file.name}`, file, { upsert: true });

      // if (error) throw error;

      // Get Public URL after upload
      // const { data: urlData } = supabase.storage
      //   .from("profile_photo")
      //   .getPublicUrl(`profile_pics/${file.name}`);

      // Update formData with the file URL
      // setFormData((prevData) => ({
      //   ...prevData,
      //   [questionId]: urlData.publicUrl, // Save the public URL for retrieval
      // }));
    } catch (error) {
      console.error("File upload error:", error);
      alert("Error uploading image. Please try again.");
    }
  };

  const handleCheckboxChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    questionId: number
  ) => {
    const { value, checked } = e.target;

    setFormData((prevData) => {
      const currentValues = prevData[questionId] || [];
      const updatedValues = checked
        ? [...currentValues, value] // add value if checked
        : currentValues.filter((v: string) => v !== value); // remove value if unchecked

      return {
        ...prevData,
        [questionId]: updatedValues,
      };
    });
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    questionId: number
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prevData) => ({
        ...prevData,
        [questionId]: file, // Store the file in formData
      }));
    }
  };

  // Toggle collapse for sections and subsections
  const toggleCollapse = (key: string) => {
    setCollapsedSections((prevState) => ({
      ...prevState,
      [key]: !prevState[key],
    }));
  };

  const handleSaveProgress = async () => {
    if (!formData.contactEmail) {
      alert("Please enter your email before saving progress.");
      return;
    }

    try {
      const savePayload = Object.entries(formData).map(
        ([questionId, answer]) => ({
          form_id: formId,
          contactEmail: formData.contactEmail,
          question_id: Number(questionId),
          answer: typeof answer === "object" ? JSON.stringify(answer) : answer, // Handle files and arrays
        })
      );

      const { error } = await supabase.from("progress").upsert(savePayload, {
        onConflict: "form_id,contactEmail,question_id", // ✅ Correct format
      });

      if (error) throw error;

      alert("Progress saved successfully!");
    } catch (error) {
      console.error("Error saving progress:", error);
      alert("Failed to save progress. Please try again.");
    }
  };

  const handleSearch = async () => {
    if (!formData.contactEmail) {
      alert("Please enter an email to search.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get Organization ID based on email
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("contactEmail", formData.contactEmail)
        .single();

      if (orgError) throw orgError;
      if (!orgData) {
        alert("No organization found for this email.");
        setLoading(false);
        return;
      }

      const organizationId = orgData.id;

      // Step 2: Get responses for the organization
      const { data: responses, error: resError } = await supabase
        .from("responses")
        .select("question_id, answer")
        .eq("organization_id", organizationId);

      if (resError) throw resError;

      if (responses.length === 0) {
        alert("No saved progress found for this email.");
      } else {
        // Step 3: Populate the form with retrieved data
        const savedData: Record<string, any> = {};
        responses.forEach((entry) => {
          savedData[String(entry.question_id)] =
            entry.answer.startsWith("{") || entry.answer.startsWith("[")
              ? JSON.parse(entry.answer) // Handle JSON data
              : entry.answer;
          console.log("Raw responses from Supabase:", responses);
          console.log("Saved Data before setting formData:", savedData);
        });
        setFormData((prevData) => ({
          ...prevData,
          ...savedData, // Updating the retrieved data in formData
        }));
      }
    } catch (error) {
      console.error("Error fetching progress:", error);
      alert("Failed to retrieve saved progress.");
    } finally {
      setLoading(false);
    }
  };

  const groupedQuestions = questions.reduce((acc, question) => {
    const section = question.section || "General";
    const subsection = question.subsection || "No Subsection";
    if (!acc[section]) acc[section] = {};
    if (!acc[section][subsection]) acc[section][subsection] = [];
    acc[section][subsection].push(question);
    return acc;
  }, {} as Record<string, Record<string, Question[]>>);

  let sectionCounter = 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#e0f2f1]">

      {/* Centered Logo */}
      <Image
        alt="logo"
        src="/Fuze.png"
        width={250}
        height={250}
        className="mb-6"
      />

            {/* Image for large screens (fixed at the top right) */}
            <div className="hidden xl:block fixed top-6 right-8">
        <Image
          src="/Fuze img.jpeg"
          alt="Your dream job is just a click away!"
          width={300}
          height={300}
          className="w-[300px] h-auto object-cover rounded-lg shadow-md"
        />
      </div>

      {/* Image for smaller screens (centered at the top above the form) */}
      <div className="xl:hidden flex justify-center mt-6 mb-6">
        <Image
          src="/Fuze img.jpeg"
          alt="Your dream job is just a click away!"
          width={300}
          height={300}
          className="w-[300px] h-auto object-cover rounded-lg shadow-md"
        />
      </div>

      {submitted ? (
        <h1 className="text-2xl text-green-600 mb-4 font-semibold">
          Thank you for submitting!
        </h1>
      ) : (
        <form
          className="bg-white shadow-lg p-8 rounded-lg max-w-3xl w-full"
          // onSubmit={handleSubmit}
          encType="multipart/form-data"
        >

          {/* Dynamic Questions */}
          {loading ? (
            <p>Loading...</p>
          ) : (
            Object.entries(groupedQuestions).map(([section, subsections]) => (
              <fieldset key={section} className="mb-6">
                <legend className="font-bold">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(section)}
                    className="text-left w-full"
                  >
                    {section}
                  </button>
                </legend>
                {!collapsedSections[section] &&
                  Object.entries(subsections).map(([subsection, questions]) =>
                    subsection === "No Subsection" ? (
                      questions
                        .filter((question) => !question.parent_question_id)
                        .map((question) => (
                          <div key={question.id}>
                            {renderQuestion(question)}
                          </div>
                        ))
                    ) : (
                      <fieldset key={subsection} className="mb-6">
                        <legend className="subLegend">
                          <button
                            type="button"
                            onClick={() =>
                              toggleCollapse(`${section}-${subsection}`)
                            }
                            className="text-left w-full"
                          >
                            {subsection}
                          </button>
                        </legend>
                        {!collapsedSections[`${section}-${subsection}`] &&
                          questions
                            .filter((question) => !question.parent_question_id)
                            .map((question) => renderQuestion(question))}
                      </fieldset>
                    )
                  )}
              </fieldset>
            ))
          )}

          <button
            // onClick={handleSubmit}
            type="button"
            className="bg-[#0f877c] text-white font-bold py-3 px-10 rounded-full shadow-lg hover:bg-[#13a99b] transition-colors block mx-auto"
          >
            Submit
          </button>
        </form>
      )}
    </div>
  );
}
