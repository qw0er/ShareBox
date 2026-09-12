import Button from "@mui/material/Button";
import { Form } from "react-router";
export default function UploadCom() {
	return (
		<Form method="post" encType="multipart/form-data">
			<input type="hidden" name="intent" value="upload" />
			<input type="file" name="file" required />
			<Button type="submit" variant="contained" color="primary">
				Upload
			</Button>
		</Form>
	);
}
